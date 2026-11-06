import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { Item } from '@/domain/entity/item';
import { Order } from '@/domain/entity/order';
import type { Role, User } from '@/domain/entity/user';
import type { Repositories } from '@/domain/repository';
import { ItemID, OrderID } from '@/domain/value-objects/ids';
import type { DatabaseConnections } from '@/infrastructure/database/connections';
import { SequenceIdGenerator } from '@/infrastructure/database/sequence-id-generator';
import { DatabaseUnitOfWork } from '@/infrastructure/database/unit-of-work';
import { createRepositories } from '@/infrastructure/repositories';
import { createTestDatabase, resetDatabase, TEST_DATABASE_URL } from './support/database';

const now = new Date('2026-01-01T12:00:00.000Z');
const later = new Date('2026-01-01T13:00:00.000Z');

describe.skipIf(!TEST_DATABASE_URL)('order workflow persistence', () => {
  let database: DatabaseConnections;
  let repositories: Repositories;
  let unitOfWork: DatabaseUnitOfWork;
  let server: User;
  let cashier: User;

  beforeAll(() => {
    database = createTestDatabase();
    repositories = createRepositories(database);
    unitOfWork = new DatabaseUnitOfWork(database, () => repositories);
  });

  beforeEach(async () => {
    await resetDatabase(database);
    server = await createUser(['SERVER']);
    cashier = await createUser(['CASHIER']);
  });

  afterAll(async () => {
    await database.close();
  });

  const orderIds = () => new SequenceIdGenerator(() => database.writeSql(), 'orders_id_seq');

  function createUser(roles: readonly Role[]): Promise<User> {
    return unitOfWork.run((repos) =>
      repos.users.create({
        name: `User ${crypto.randomUUID()}`,
        email: `user-${crypto.randomUUID()}@example.com`,
        passwordHash: 'hash',
        roles,
        now,
      }),
    );
  }

  function createItem(
    name: string,
    priceCents: number,
    extra: { category?: string; active?: boolean } = {},
  ): Promise<Item> {
    return unitOfWork.run((repos) =>
      repos.items.create({
        name,
        description: null,
        priceCents,
        imageUrl: null,
        now,
        ...extra,
      }),
    );
  }

  async function openTable(tableCode: string, feeBasisPoints = 1000): Promise<Order> {
    const order = Order.openTable({
      id: new OrderID(await orderIds().next()),
      openedByUserId: server.id,
      tableCode,
      serviceFeeBasisPoints: feeBasisPoints,
      now,
    });
    await unitOfWork.run((repos) => repos.orders.create(order));
    return order;
  }

  const reload = (id: OrderID) => unitOfWork.run((repos) => repos.orders.findById(id));

  test('round-trips pricing, the payment request, and the derived amounts', async () => {
    const coffee = await createItem('Coffee', 1000);
    const order = await openTable('T-1');
    order.addItem(coffee, 2, now);
    order.setAdjustment({ type: 'DISCOUNT', mode: 'PERCENT', value: 1000 }, now);
    order.requestPayment(server.id, later);
    await unitOfWork.run((repos) => repos.orders.save(order));

    const found = await reload(order.id);

    expect(found?.status).toBe('AWAITING_PAYMENT');
    expect(found?.paymentRequestedByUserId?.value).toBe(server.id.value);
    expect(found?.paymentRequestedAt).toEqual(later);
    expect(found?.adjustment).toEqual({ type: 'DISCOUNT', mode: 'PERCENT', value: 1000 });
    expect(found?.applyServiceFee).toBe(true);
    expect(found?.serviceFeeBasisPoints).toBe(1000);

    // 2000 - 10% = 1800, plus a 10% fee = 1980. The amounts are stored as a snapshot.
    const [row] = await database.write.query<
      { total: string; adjustment: string; fee: string }[]
    >`SELECT total_amount_cents::text AS total, adjustment_cents::text AS adjustment,
             service_fee_cents::text AS fee FROM orders WHERE id = ${order.id.value}`;
    expect({ ...row }).toEqual({ total: '1980', adjustment: '-200', fee: '180' });
  });

  test('reopens, then closes with a cash tender and keeps the request history', async () => {
    const coffee = await createItem('Coffee', 1000);
    const order = await openTable('T-1', 0);
    order.addItem(coffee, 1, now);
    order.requestPayment(server.id, now);
    await unitOfWork.run((repos) => repos.orders.save(order));

    const waiting = await reload(order.id);
    waiting?.reopen(later);
    await unitOfWork.run((repos) => repos.orders.save(waiting as Order));
    const reopened = await reload(order.id);
    expect(reopened?.status).toBe('OPEN');
    expect(reopened?.paymentRequestedAt).toBeNull();

    reopened?.requestPayment(server.id, later);
    reopened?.close(
      cashier.id,
      [{ method: 'CASH', amountCents: 1000, receivedCents: 1500 }],
      later,
    );
    await unitOfWork.run((repos) => repos.orders.save(reopened as Order));

    const closed = await reload(order.id);
    expect(closed?.status).toBe('CLOSED');
    expect(closed?.paymentRequestedAt).toEqual(later);
    expect(closed?.payments[0]?.receivedCents).toBe(1500);
    expect(closed?.payments[0]?.changeCents).toBe(500);
  });

  test('deletes the lines that were removed from the order', async () => {
    const coffee = await createItem('Coffee', 500);
    const cake = await createItem('Cake', 300);
    const order = await openTable('T-1', 0);
    order.addItem(coffee, 1, now);
    order.addItem(cake, 1, now);
    await unitOfWork.run((repos) => repos.orders.save(order));

    order.removeItem(coffee.id, later);
    await unitOfWork.run((repos) => repos.orders.save(order));

    const found = await reload(order.id);
    expect(found?.items.map((line) => line.itemId.value)).toEqual([cake.id.value]);
    expect(found?.total.cents).toBe(300);

    order.removeItem(cake.id, later);
    await unitOfWork.run((repos) => repos.orders.save(order));
    expect((await reload(order.id))?.items).toHaveLength(0);
  });

  test('persists a counter sale with its label, adjustment, and fee', async () => {
    const coffee = await createItem('Coffee', 1000);
    const order = Order.createCounter({
      id: new OrderID(await orderIds().next()),
      openedByUserId: cashier.id,
      label: 'Maria',
      lines: [{ item: coffee, quantity: 2 }],
      adjustment: { type: 'SURCHARGE', mode: 'FIXED', value: 200 },
      serviceFeeBasisPoints: 1000,
      payments: [{ method: 'PIX', amountCents: 2420 }],
      now,
    });
    await unitOfWork.run((repos) => repos.orders.create(order));

    const found = await reload(order.id);

    expect(found?.label).toBe('Maria');
    expect(found?.adjustment).toEqual({ type: 'SURCHARGE', mode: 'FIXED', value: 200 });
    expect(found?.total.cents).toBe(2420);
    expect(found?.payments.map((payment) => payment.amountCents)).toEqual([2420]);
  });

  test('keeps the price an item had when it was ordered', async () => {
    const coffee = await createItem('Coffee', 1000);
    const order = await openTable('T-1', 0);
    order.addItem(coffee, 2, now);
    await unitOfWork.run((repos) => repos.orders.save(order));

    coffee.update({ priceCents: 5000, now: later });
    await unitOfWork.run((repos) => repos.items.update(coffee));

    const found = await reload(order.id);
    expect(found?.total.cents).toBe(2000);
    expect(found?.items[0]?.unitPrice.cents).toBe(1000);
  });

  describe('tables', () => {
    test('finds the order occupying a table while it is open or awaiting payment', async () => {
      const coffee = await createItem('Coffee', 500);
      const order = await openTable('T-9', 0);
      const find = () => unitOfWork.run((repos) => repos.orders.findActiveTableByCode('T-9'));

      expect((await find())?.id.value).toBe(order.id.value);

      order.addItem(coffee, 1, now);
      order.requestPayment(server.id, now);
      await unitOfWork.run((repos) => repos.orders.save(order));
      expect((await find())?.status).toBe('AWAITING_PAYMENT');

      order.cancel(cashier.id, later);
      await unitOfWork.run((repos) => repos.orders.save(order));
      expect(await find()).toBeNull();
    });

    test('allows only one active order per table, but reuses it after it closes', async () => {
      const first = await openTable('T-1');

      await expect(openTable('T-1')).rejects.toThrow();

      first.cancel(cashier.id, later);
      await unitOfWork.run((repos) => repos.orders.save(first));
      await expect(openTable('T-1')).resolves.toBeDefined();
    });
  });

  test('serializes concurrent updates to the same order', async () => {
    const coffee = await createItem('Coffee', 100);
    const order = await openTable('T-1', 0);

    const add = () =>
      unitOfWork.run(async (repos) => {
        const current = (await repos.orders.findById(order.id, { forUpdate: true })) as Order;
        current.addItem(coffee, 1, new Date());
        await repos.orders.save(current);
      });

    await Promise.all(Array.from({ length: 8 }, add));

    const found = await reload(order.id);
    expect(found?.getItem(coffee.id)?.quantity).toBe(8);
    expect(found?.version).toBe(order.version + 8);
  });

  describe('catalog', () => {
    test('stores the category and the enabled flag', async () => {
      const beer = await createItem('Beer', 1000, { category: 'Drinks' });
      const off = await createItem('Old special', 900, { active: false });

      const foundBeer = await unitOfWork.run((repos) => repos.items.findById(beer.id));
      const foundOff = await unitOfWork.run((repos) => repos.items.findById(off.id));

      expect(foundBeer?.category).toBe('Drinks');
      expect(foundOff?.isEnabled).toBe(false);

      foundOff?.update({ active: true, category: 'Specials', now: later });
      await unitOfWork.run((repos) => repos.items.update(foundOff as Item));
      const updated = await unitOfWork.run((repos) => repos.items.findById(off.id));
      expect(updated?.isSellable).toBe(true);
      expect(updated?.category).toBe('Specials');
    });

    test('lists everything for administrators and only sellable items for sale', async () => {
      await createItem('Beer', 1000, { category: 'Drinks' });
      await createItem('Hidden', 500, { active: false });
      const gone = await createItem('Gone', 500);
      gone.remove(later);
      await unitOfWork.run((repos) => repos.items.update(gone));

      const admin = await unitOfWork.run((repos) => repos.items.list({ page: 1, pageSize: 20 }));
      const sale = await unitOfWork.run((repos) =>
        repos.items.list({ page: 1, pageSize: 20, sellableOnly: true }),
      );

      expect(admin.items.map((item) => item.name).sort()).toEqual(['Beer', 'Hidden']);
      expect(sale.items.map((item) => item.name)).toEqual(['Beer']);
      expect(sale.total).toBe(1);
    });

    test('finds only sellable items by id', async () => {
      const beer = await createItem('Beer', 1000);
      const hidden = await createItem('Hidden', 500, { active: false });

      const found = await unitOfWork.run((repos) =>
        repos.items.findSellableByIds([beer.id, hidden.id]),
      );

      expect(found.map((item) => item.id.value)).toEqual([beer.id.value]);
      expect(await unitOfWork.run((repos) => repos.items.findSellableByIds([]))).toEqual([]);
    });
  });

  describe('settings', () => {
    test('reads the seeded defaults', async () => {
      const settings = await unitOfWork.run((repos) => repos.settings.get());

      expect(settings.serviceFeeEnabled).toBe(false);
      expect(settings.serviceFeeBasisPoints).toBe(1000);
      expect(settings.effectiveServiceFeeBasisPoints).toBe(0);
      expect(settings.updatedByUserId).toBeNull();
    });

    test('saves changes and who made them', async () => {
      const settings = await unitOfWork.run((repos) => repos.settings.get());
      settings.update({
        serviceFeeEnabled: false,
        serviceFeeBasisPoints: 1250,
        byUserId: cashier.id,
        now: later,
      });
      await unitOfWork.run((repos) => repos.settings.save(settings));

      const found = await unitOfWork.run((repos) => repos.settings.get());

      expect(found.serviceFeeEnabled).toBe(false);
      expect(found.serviceFeeBasisPoints).toBe(1250);
      expect(found.effectiveServiceFeeBasisPoints).toBe(0);
      expect(found.updatedByUserId?.value).toBe(cashier.id.value);
    });

    test('fails loudly when the settings row is missing', async () => {
      await database.write.query`DELETE FROM settings`;

      try {
        await expect(unitOfWork.run((repos) => repos.settings.get())).rejects.toThrow(
          'Settings row is missing',
        );
      } finally {
        await database.write.query`INSERT INTO settings (id) VALUES (1)`;
      }
    });
  });

  test('an item id that does not exist is never returned', async () => {
    expect(
      await unitOfWork.run((repos) => repos.items.findSellableByIds([new ItemID('999999')])),
    ).toEqual([]);
  });
});

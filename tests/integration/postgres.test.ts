import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { Item } from '@/domain/entity/item';
import { Order } from '@/domain/entity/order';
import type { Role, User } from '@/domain/entity/user';
import type { Repositories } from '@/domain/repository';
import { ItemID, OrderID, UserID } from '@/domain/value-objects/ids';
import type { DatabaseConnections } from '@/infrastructure/database/connections';
import { SequenceIdGenerator } from '@/infrastructure/database/sequence-id-generator';
import { DatabaseUnitOfWork } from '@/infrastructure/database/unit-of-work';
import { createRepositories } from '@/infrastructure/repositories';
import {
  createTestDatabase,
  insertUser,
  resetDatabase,
  TEST_DATABASE_URL,
} from './support/database';

const now = new Date('2026-01-01T12:00:00.000Z');
const later = new Date('2026-01-01T13:00:00.000Z');

describe.skipIf(!TEST_DATABASE_URL)('PostgreSQL repositories', () => {
  let database: DatabaseConnections;
  let repositories: Repositories;
  let unitOfWork: DatabaseUnitOfWork;

  beforeAll(() => {
    database = createTestDatabase();
    repositories = createRepositories(database);
    unitOfWork = new DatabaseUnitOfWork(database, () => repositories);
  });

  beforeEach(async () => {
    await resetDatabase(database);
  });

  afterAll(async () => {
    await database.close();
  });

  const itemIds = () => new SequenceIdGenerator(database.write, 'items_id_seq');
  const orderIds = () => new SequenceIdGenerator(database.write, 'orders_id_seq');

  async function createUser(roles: Role[] = ['ADMIN']): Promise<User> {
    const { id } = await insertUser(database, { roles });
    const user = await unitOfWork.run((repos) => repos.users.findById(new UserID(id)));
    if (!user) {
      throw new Error('Expected user');
    }
    return user;
  }

  async function createItem(name = 'Coffee', priceCents = 750) {
    const item = Item.create({
      id: new ItemID(await itemIds().next()),
      name,
      priceCents,
      now,
    });
    await unitOfWork.run((repos) => repos.items.create(item));
    return item;
  }

  test('maps users, multiple roles, ban state, and pagination', async () => {
    const active = await insertUser(database, { roles: ['CASHIER', 'SERVER'] });
    const banned = await insertUser(database, { roles: ['SERVER'], banned: true });

    const found = await unitOfWork.run((repos) =>
      repos.users.findByEmail(active.email.toUpperCase()),
    );
    expect(found?.id.value).toBe(active.id);
    expect(found?.roles).toEqual(['CASHIER', 'SERVER']);
    expect(found?.isActive).toBe(true);

    const bannedUser = await unitOfWork.run((repos) => repos.users.findById(new UserID(banned.id)));
    expect(bannedUser?.isActive).toBe(false);

    const page = await unitOfWork.run((repos) => repos.users.list({ page: 1, pageSize: 20 }));
    expect(page.total).toBe(2);
    expect(page.users).toHaveLength(2);
  });

  test('enforces role check and keeps users referenced by sessions', async () => {
    await expect(
      database.write`
        INSERT INTO users (name, email, role)
        VALUES ('Invalid', ${`invalid-${crypto.randomUUID()}@example.com`}, 'OWNER')
      `,
    ).rejects.toThrow();

    const { id } = await insertUser(database);
    await database.write`
      INSERT INTO sessions (user_id, token, expires_at)
      VALUES (${id}, ${crypto.randomUUID()}, CURRENT_TIMESTAMP + INTERVAL '1 hour')
    `;

    await expect(database.write`DELETE FROM users WHERE id = ${id}`).rejects.toThrow();
  });

  test('maps items, price updates, soft removal, and active filtering', async () => {
    const item = await createItem();

    const found = await unitOfWork.run((repos) => repos.items.findById(item.id));
    expect(found?.price.cents).toBe(750);

    found?.update({ priceCents: 900, now: later });
    await unitOfWork.run((repos) => repos.items.update(found as Item));

    const updated = await unitOfWork.run((repos) => repos.items.findById(item.id));
    expect(updated?.price.cents).toBe(900);

    updated?.remove(later);
    await unitOfWork.run((repos) => repos.items.update(updated as Item));

    const active = await unitOfWork.run((repos) => repos.items.findActiveByIds([item.id]));
    expect(active).toHaveLength(0);

    const activePage = await unitOfWork.run((repos) => repos.items.list({ page: 1, pageSize: 20 }));
    expect(activePage.total).toBe(0);

    const allPage = await unitOfWork.run((repos) =>
      repos.items.list({ page: 1, pageSize: 20, includeRemoved: true }),
    );
    expect(allPage.total).toBe(1);
    expect(allPage.items[0]?.isActive).toBe(false);
  });

  test('persists counter orders with payments and reads history filters', async () => {
    const cashier = await createUser(['CASHIER']);
    const coffee = await createItem('Coffee', 750);
    const cake = await createItem('Cake', 300);
    const order = Order.createCounter({
      id: new OrderID(await orderIds().next()),
      openedByUserId: cashier.id,
      lines: [
        { item: coffee, quantity: 2 },
        { item: cake, quantity: 1 },
        { item: coffee, quantity: 1 },
      ],
      payments: [
        { method: 'CASH', amountCents: 1000 },
        { method: 'CREDIT_CARD', amountCents: 1550 },
      ],
      now,
    });

    await unitOfWork.run((repos) => repos.orders.create(order));

    const found = await unitOfWork.run((repos) => repos.orders.findById(order.id));
    expect(found?.status).toBe('CLOSED');
    expect(found?.items).toHaveLength(2);
    expect(found?.total.cents).toBe(2550);
    expect(found?.closedByUserId?.value).toBe(cashier.id.value);
    expect(found?.payments.map((payment) => [payment.method, payment.amountCents])).toEqual([
      ['CASH', 1000],
      ['CREDIT_CARD', 1550],
    ]);

    const page = await unitOfWork.run((repos) =>
      repos.orders.list({
        type: 'COUNTER',
        status: 'CLOSED',
        from: new Date('2025-12-31T00:00:00.000Z'),
        to: new Date('2026-01-02T00:00:00.000Z'),
        page: 1,
        pageSize: 20,
      }),
    );
    expect(page.total).toBe(1);
    expect(page.orders[0]?.id.value).toBe(order.id.value);
    expect(page.orders[0]?.payments).toHaveLength(2);
  });

  test('persists table order lifecycle and upserts lines by composite key', async () => {
    const server = await createUser(['SERVER']);
    const cashier = await createUser(['CASHIER']);
    const coffee = await createItem('Coffee', 750);
    const order = Order.openTable({
      id: new OrderID(await orderIds().next()),
      openedByUserId: server.id,
      tableCode: 'T-01',
      now,
    });

    await unitOfWork.run((repos) => repos.orders.create(order));

    order.addItem(coffee, 2, now);
    await unitOfWork.run((repos) => repos.orders.save(order));

    const opened = await unitOfWork.run((repos) =>
      repos.orders.findById(order.id, { forUpdate: true }),
    );
    expect(opened?.status).toBe('OPEN');
    expect(opened?.items).toHaveLength(1);
    expect(opened?.total.cents).toBe(1500);
    expect(opened?.payments).toHaveLength(0);

    opened?.changeItemQuantity(coffee.id, 3, later);
    await unitOfWork.run((repos) => repos.orders.save(opened as Order));

    const changed = await unitOfWork.run((repos) => repos.orders.findById(order.id));
    expect(changed?.items[0]?.quantity).toBe(3);
    expect(changed?.total.cents).toBe(2250);

    changed?.close(
      cashier.id,
      [
        { method: 'CASH', amountCents: 1000 },
        { method: 'PIX', amountCents: 1250 },
      ],
      later,
    );
    await unitOfWork.run((repos) => repos.orders.save(changed as Order));

    const closed = await unitOfWork.run((repos) => repos.orders.findById(order.id));
    expect(closed?.status).toBe('CLOSED');
    expect(closed?.closedByUserId?.value).toBe(cashier.id.value);
    expect(closed?.payments.map((payment) => [payment.method, payment.amountCents])).toEqual([
      ['CASH', 1000],
      ['PIX', 1250],
    ]);

    const line = closed?.items[0];
    if (!line) {
      throw new Error('Expected order line');
    }

    await unitOfWork.run(async (repos) => {
      await repos.orderItems.upsert(order.id, line);
      await repos.orderItems.upsert(order.id, line);
      await repos.orders.save(closed as Order);
    });

    const lines = await unitOfWork.run((repos) => repos.orderItems.findByOrderId(order.id));
    expect(lines).toHaveLength(1);
    expect(lines[0]?.quantity).toBe(3);

    const reclosed = await unitOfWork.run((repos) => repos.orders.findById(order.id));
    expect(reclosed?.payments).toHaveLength(2);
  });

  test('rolls back the whole transaction on failure', async () => {
    const id = await itemIds().next();
    const item = Item.create({
      id: new ItemID(id),
      name: 'Rollback Item',
      priceCents: 100,
      now,
    });

    await expect(
      unitOfWork.run(async (repos) => {
        await repos.items.create(item);
        throw new Error('forced rollback');
      }),
    ).rejects.toThrow('forced rollback');

    const found = await unitOfWork.run((repos) => repos.items.findById(new ItemID(id)));
    expect(found).toBeNull();
  });

  test('enforces SQL constraints and restrictive foreign keys', async () => {
    const user = await createUser(['CASHIER']);
    const item = await createItem('Coffee', 750);
    const order = Order.createCounter({
      id: new OrderID(await orderIds().next()),
      openedByUserId: user.id,
      lines: [{ item, quantity: 1 }],
      payments: [{ method: 'CASH', amountCents: 750 }],
      now,
    });
    await unitOfWork.run((repos) => repos.orders.create(order));

    await expect(
      database.write`
        INSERT INTO order_items (
          order_id, item_id, item_name_snapshot, quantity, unit_price_cents
        ) VALUES (${order.id.value}, ${item.id.value}, 'Coffee', 1, 750)
      `,
    ).rejects.toThrow();

    await expect(
      database.write`
        INSERT INTO orders (order_type, status, opened_by_user_id)
        VALUES ('COUNTER', 'OPEN', ${user.id.value})
      `,
    ).rejects.toThrow();

    await expect(
      database.write`
        INSERT INTO items (name, price_cents)
        VALUES ('Invalid', -1)
      `,
    ).rejects.toThrow();

    const zeroItem = await createItem('Zero', 100);
    await expect(
      database.write`
        INSERT INTO order_items (
          order_id, item_id, item_name_snapshot, quantity, unit_price_cents
        ) VALUES (${order.id.value}, ${zeroItem.id.value}, 'Zero', 0, 100)
      `,
    ).rejects.toThrow();

    await expect(
      database.write`
        INSERT INTO order_payments (order_id, method, amount_cents)
        VALUES (${order.id.value}, 'CASH', 0)
      `,
    ).rejects.toThrow();

    await expect(database.write`DELETE FROM users WHERE id = ${user.id.value}`).rejects.toThrow();
  });
});

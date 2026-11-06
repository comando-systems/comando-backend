import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { requireActor } from '@/app/authorization';
import { ForbiddenError } from '@/app/errors';
import {
  AddOrderItemsUseCase,
  CancelOrderUseCase,
  ChangeOrderItemQuantityUseCase,
  CloseOrderUseCase,
  CreateCounterOrderUseCase,
  GetOrderUseCase,
  ListOrdersUseCase,
  OpenTableOrderUseCase,
} from '@/app/use-cases';
import type { Item } from '@/domain/entity/item';
import type { PaymentMethod } from '@/domain/entity/order';
import type { Role, User } from '@/domain/entity/user';
import { InvalidStateTransitionError } from '@/domain/errors';
import type { Repositories } from '@/domain/repository';
import { ItemID, OrderID } from '@/domain/value-objects/ids';
import type { DatabaseConnections } from '@/infrastructure/database/connections';
import { SequenceIdGenerator } from '@/infrastructure/database/sequence-id-generator';
import { DatabaseUnitOfWork } from '@/infrastructure/database/unit-of-work';
import { createRepositories } from '@/infrastructure/repositories';
import { MutableClock } from '../support/clock';
import { createTestDatabase, resetDatabase, TEST_DATABASE_URL } from './support/database';

const initialNow = new Date('2026-01-01T12:00:00.000Z');

describe.skipIf(!TEST_DATABASE_URL)('order application use cases', () => {
  let database: DatabaseConnections;
  let repositories: Repositories;
  let unitOfWork: DatabaseUnitOfWork;
  let clock: MutableClock;
  let createCounterOrder: CreateCounterOrderUseCase;
  let openTableOrder: OpenTableOrderUseCase;
  let addOrderItems: AddOrderItemsUseCase;
  let changeOrderItemQuantity: ChangeOrderItemQuantityUseCase;
  let closeOrder: CloseOrderUseCase;
  let cancelOrder: CancelOrderUseCase;
  let listOrders: ListOrdersUseCase;
  let getOrder: GetOrderUseCase;

  beforeAll(() => {
    database = createTestDatabase();
    repositories = createRepositories(database);
    unitOfWork = new DatabaseUnitOfWork(database, () => repositories);
    clock = new MutableClock(initialNow);
    const orderIds = new SequenceIdGenerator(database.write, 'orders_id_seq');
    createCounterOrder = new CreateCounterOrderUseCase(unitOfWork, orderIds, clock);
    openTableOrder = new OpenTableOrderUseCase(unitOfWork, orderIds, clock);
    addOrderItems = new AddOrderItemsUseCase(unitOfWork, clock);
    changeOrderItemQuantity = new ChangeOrderItemQuantityUseCase(unitOfWork, clock);
    closeOrder = new CloseOrderUseCase(unitOfWork, clock);
    cancelOrder = new CancelOrderUseCase(unitOfWork, clock);
    listOrders = new ListOrdersUseCase(unitOfWork);
    getOrder = new GetOrderUseCase(unitOfWork);
  });

  beforeEach(async () => {
    await resetDatabase(database);
    clock = new MutableClock(initialNow);
    createCounterOrder = new CreateCounterOrderUseCase(
      unitOfWork,
      new SequenceIdGenerator(database.write, 'orders_id_seq'),
      clock,
    );
    openTableOrder = new OpenTableOrderUseCase(
      unitOfWork,
      new SequenceIdGenerator(database.write, 'orders_id_seq'),
      clock,
    );
    addOrderItems = new AddOrderItemsUseCase(unitOfWork, clock);
    changeOrderItemQuantity = new ChangeOrderItemQuantityUseCase(unitOfWork, clock);
    closeOrder = new CloseOrderUseCase(unitOfWork, clock);
    cancelOrder = new CancelOrderUseCase(unitOfWork, clock);
  });

  afterAll(async () => {
    await database.close();
  });

  async function createUser(roles: readonly Role[]): Promise<User> {
    return unitOfWork.run((repos) =>
      repos.users.create({
        name: `User ${crypto.randomUUID()}`,
        email: `user-${crypto.randomUUID()}@example.com`,
        passwordHash: 'hash',
        roles,
        now: clock.now(),
      }),
    );
  }

  async function createItem(name: string, priceCents: number): Promise<Item> {
    return unitOfWork.run((repos) =>
      repos.items.create({
        name,
        description: null,
        priceCents,
        imageUrl: null,
        now: clock.now(),
      }),
    );
  }

  test('creates a counter order directly as CLOSED with split payments', async () => {
    const cashier = await createUser(['CASHIER']);
    const server = await createUser(['SERVER']);
    const coffee = await createItem('Coffee', 750);
    const cake = await createItem('Cake', 300);

    const order = await createCounterOrder.execute({
      actorUserId: cashier.id,
      lines: [
        { itemId: coffee.id, quantity: 2 },
        { itemId: cake.id, quantity: 1 },
        { itemId: coffee.id, quantity: 1 },
      ],
      payments: [
        { method: 'CASH', amountCents: 1000 },
        { method: 'CREDIT_CARD', amountCents: 1550 },
      ],
    });

    expect(order.status).toBe('CLOSED');
    expect(order.total.cents).toBe(2550);
    expect(order.items).toHaveLength(2);
    expect(order.getItem(coffee.id)?.quantity).toBe(3);
    expect(order.payments.map((payment) => [payment.method, payment.amountCents])).toEqual([
      ['CASH', 1000],
      ['CREDIT_CARD', 1550],
    ]);

    const saved = await unitOfWork.run((repos) => repos.orders.findById(order.id));
    expect(saved?.status).toBe('CLOSED');
    expect(saved?.total.cents).toBe(2550);

    await expect(
      createCounterOrder.execute({
        actorUserId: server.id,
        lines: [{ itemId: coffee.id, quantity: 1 }],
        payments: [{ method: 'CASH', amountCents: 750 }],
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  test('rejects unavailable items, invalid quantities, and mismatched payments', async () => {
    const cashier = await createUser(['CASHIER']);
    const coffee = await createItem('Coffee', 750);
    const removed = await createItem('Removed', 500);
    removed.remove(clock.now());
    await unitOfWork.run((repos) => repos.items.update(removed));

    await expect(
      createCounterOrder.execute({
        actorUserId: cashier.id,
        lines: [{ itemId: removed.id, quantity: 1 }],
        payments: [{ method: 'CASH', amountCents: 500 }],
      }),
    ).rejects.toThrow('is not available');

    await expect(
      createCounterOrder.execute({
        actorUserId: cashier.id,
        lines: [{ itemId: coffee.id, quantity: 0 }],
        payments: [{ method: 'CASH', amountCents: 0 }],
      }),
    ).rejects.toThrow();

    await expect(
      createCounterOrder.execute({
        actorUserId: cashier.id,
        lines: [{ itemId: coffee.id, quantity: 1 }],
        payments: [{ method: 'CASH', amountCents: 700 }],
      }),
    ).rejects.toThrow('Payments must sum to the order total');

    await expect(
      createCounterOrder.execute({
        actorUserId: cashier.id,
        lines: [{ itemId: coffee.id, quantity: 1 }],
        payments: [{ method: 'BITCOIN' as PaymentMethod, amountCents: 750 }],
      }),
    ).rejects.toThrow('Invalid payment method');
  });

  test('opens table orders and rejects duplicate open tables', async () => {
    const server = await createUser(['SERVER']);
    const admin = await createUser(['ADMIN']);

    const order = await openTableOrder.execute({ actorUserId: server.id, tableCode: ' T-01 ' });

    expect(order.status).toBe('OPEN');
    expect(order.type).toBe('TABLE');
    expect(order.tableCode).toBe('T-01');
    expect(order.total.cents).toBe(0);

    await expect(
      openTableOrder.execute({ actorUserId: server.id, tableCode: 'T-01' }),
    ).rejects.toThrow('Table already has an open order');

    await expect(
      openTableOrder.execute({ actorUserId: admin.id, tableCode: 'T-02' }),
    ).rejects.toThrow('You are not allowed');

    const open = await unitOfWork.run((repos) => repos.orders.findActiveTableByCode('T-01'));
    expect(open?.id.value).toBe(order.id.value);
  });

  test('adds items, increments existing lines, and changes quantities', async () => {
    const server = await createUser(['SERVER']);
    const admin = await createUser(['ADMIN']);
    const coffee = await createItem('Coffee', 750);
    const cake = await createItem('Cake', 300);

    const order = await openTableOrder.execute({ actorUserId: server.id, tableCode: 'T-01' });

    const added = await addOrderItems.execute({
      actorUserId: server.id,
      orderId: order.id,
      lines: [
        { itemId: coffee.id, quantity: 1 },
        { itemId: cake.id, quantity: 2 },
      ],
    });

    expect(added.items).toHaveLength(2);
    expect(added.total.cents).toBe(1350);

    const incremented = await addOrderItems.execute({
      actorUserId: server.id,
      orderId: order.id,
      lines: [{ itemId: coffee.id, quantity: 2 }],
    });

    expect(incremented.items).toHaveLength(2);
    expect(incremented.getItem(coffee.id)?.quantity).toBe(3);
    expect(incremented.total.cents).toBe(2850);

    coffee.update({ priceCents: 999, now: clock.now() });
    await unitOfWork.run((repos) => repos.items.update(coffee));

    const afterPriceChange = await addOrderItems.execute({
      actorUserId: server.id,
      orderId: order.id,
      lines: [{ itemId: coffee.id, quantity: 1 }],
    });

    expect(afterPriceChange.getItem(coffee.id)?.quantity).toBe(4);
    expect(afterPriceChange.getItem(coffee.id)?.unitPrice.cents).toBe(750);
    expect(afterPriceChange.total.cents).toBe(3600);

    const changed = await changeOrderItemQuantity.execute({
      actorUserId: server.id,
      orderId: order.id,
      itemId: coffee.id,
      quantity: 5,
    });

    expect(changed.getItem(coffee.id)?.quantity).toBe(5);
    expect(changed.total.cents).toBe(4350);

    await expect(
      addOrderItems.execute({
        actorUserId: admin.id,
        orderId: order.id,
        lines: [{ itemId: cake.id, quantity: 1 }],
      }),
    ).rejects.toThrow('You are not allowed');

    await expect(
      changeOrderItemQuantity.execute({
        actorUserId: server.id,
        orderId: order.id,
        itemId: cake.id,
        quantity: 0,
      }),
    ).rejects.toThrow();

    await expect(
      changeOrderItemQuantity.execute({
        actorUserId: server.id,
        orderId: order.id,
        itemId: new ItemID('999999'),
        quantity: 1,
      }),
    ).rejects.toThrow('Order item not found');
  });

  test('closes and cancels table orders while enforcing terminal states', async () => {
    const server = await createUser(['SERVER']);
    const cashier = await createUser(['CASHIER']);
    const coffee = await createItem('Coffee', 1000);

    const toClose = await openTableOrder.execute({ actorUserId: server.id, tableCode: 'T-01' });
    await addOrderItems.execute({
      actorUserId: server.id,
      orderId: toClose.id,
      lines: [{ itemId: coffee.id, quantity: 1 }],
    });

    await expect(
      closeOrder.execute({
        actorUserId: cashier.id,
        orderId: toClose.id,
        payments: [{ method: 'CASH', amountCents: 900 }],
      }),
    ).rejects.toThrow('Payments must sum to the order total');

    const closed = await closeOrder.execute({
      actorUserId: cashier.id,
      orderId: toClose.id,
      payments: [
        { method: 'CASH', amountCents: 400 },
        { method: 'PIX', amountCents: 600 },
      ],
    });

    expect(closed.status).toBe('CLOSED');
    expect(closed.closedByUserId?.value).toBe(cashier.id.value);
    expect(closed.payments).toHaveLength(2);

    await expect(
      addOrderItems.execute({
        actorUserId: server.id,
        orderId: toClose.id,
        lines: [{ itemId: coffee.id, quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(InvalidStateTransitionError);

    await expect(
      cancelOrder.execute({ actorUserId: server.id, orderId: toClose.id }),
    ).rejects.toBeInstanceOf(InvalidStateTransitionError);

    const toCancel = await openTableOrder.execute({ actorUserId: server.id, tableCode: 'T-02' });
    const canceled = await cancelOrder.execute({
      actorUserId: cashier.id,
      orderId: toCancel.id,
    });

    expect(canceled.status).toBe('CANCELED');
    expect(canceled.canceledByUserId?.value).toBe(cashier.id.value);

    await expect(
      closeOrder.execute({
        actorUserId: cashier.id,
        orderId: toCancel.id,
        payments: [],
      }),
    ).rejects.toBeInstanceOf(InvalidStateTransitionError);

    const unknownOrderId = new OrderID('999999');
    await expect(
      closeOrder.execute({
        actorUserId: cashier.id,
        orderId: unknownOrderId,
        payments: [],
      }),
    ).rejects.toThrow('Order not found');
  });

  test('lets the cashier close, either role cancel, and closes zero-total orders', async () => {
    const server = await createUser(['SERVER']);
    const cashier = await createUser(['CASHIER']);
    const coffee = await createItem('Coffee', 500);

    const toClose = await openTableOrder.execute({ actorUserId: server.id, tableCode: 'T-01' });
    await addOrderItems.execute({
      actorUserId: server.id,
      orderId: toClose.id,
      lines: [{ itemId: coffee.id, quantity: 1 }],
    });

    // The server hands the table over; taking the payment belongs to the cashier.
    await expect(
      closeOrder.execute({
        actorUserId: server.id,
        orderId: toClose.id,
        payments: [{ method: 'CASH', amountCents: 500 }],
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const closed = await closeOrder.execute({
      actorUserId: cashier.id,
      orderId: toClose.id,
      payments: [{ method: 'CASH', amountCents: 500 }],
    });
    expect(closed.closedByUserId?.value).toBe(cashier.id.value);

    const toCancel = await openTableOrder.execute({ actorUserId: server.id, tableCode: 'T-02' });
    const canceled = await cancelOrder.execute({
      actorUserId: server.id,
      orderId: toCancel.id,
    });
    expect(canceled.canceledByUserId?.value).toBe(server.id.value);

    const empty = await openTableOrder.execute({ actorUserId: server.id, tableCode: 'T-03' });
    const closedEmpty = await closeOrder.execute({
      actorUserId: cashier.id,
      orderId: empty.id,
      payments: [],
    });

    expect(closedEmpty.status).toBe('CLOSED');
    expect(closedEmpty.total.cents).toBe(0);
    expect(closedEmpty.payments).toHaveLength(0);
  });

  test('lists and reads order history with filters and permissions', async () => {
    const cashier = await createUser(['CASHIER']);
    const server = await createUser(['SERVER']);
    const admin = await createUser(['ADMIN']);
    const coffee = await createItem('Coffee', 750);

    const first = await createCounterOrder.execute({
      actorUserId: cashier.id,
      lines: [{ itemId: coffee.id, quantity: 1 }],
      payments: [{ method: 'CASH', amountCents: 750 }],
    });
    clock.advance(3_600);
    const second = await createCounterOrder.execute({
      actorUserId: cashier.id,
      lines: [{ itemId: coffee.id, quantity: 2 }],
      payments: [{ method: 'PIX', amountCents: 1500 }],
    });
    clock.advance(3_600);
    const table = await openTableOrder.execute({ actorUserId: server.id, tableCode: 'T-01' });

    const closedCounter = await listOrders.execute({
      actorUserId: cashier.id,
      status: 'CLOSED',
      type: 'COUNTER',
      page: 1,
      pageSize: 20,
    });
    expect(closedCounter.total).toBe(2);
    expect(closedCounter.orders.map((order) => order.id.value)).toEqual([
      second.id.value,
      first.id.value,
    ]);

    const filtered = await listOrders.execute({
      actorUserId: cashier.id,
      type: 'COUNTER',
      from: first.openedAt,
      to: first.openedAt,
      page: 1,
      pageSize: 20,
    });
    expect(filtered.total).toBe(1);
    expect(filtered.orders[0]?.id.value).toBe(first.id.value);

    const openTables = await listOrders.execute({
      actorUserId: cashier.id,
      status: 'OPEN',
      type: 'TABLE',
      page: 1,
      pageSize: 20,
    });
    expect(openTables.total).toBe(1);
    expect(openTables.orders[0]?.id.value).toBe(table.id.value);

    const found = await getOrder.execute({ actorUserId: cashier.id, orderId: first.id });
    expect(found.id.value).toBe(first.id.value);

    await expect(
      listOrders.execute({ actorUserId: server.id, page: 1, pageSize: 20 }),
    ).rejects.toThrow('You are not allowed');

    await expect(getOrder.execute({ actorUserId: server.id, orderId: first.id })).rejects.toThrow(
      'You are not allowed',
    );

    // Administrators read the history too, so they can follow the figures they report on.
    const adminView = await getOrder.execute({ actorUserId: admin.id, orderId: first.id });
    expect(adminView.id.value).toBe(first.id.value);

    await expect(
      listOrders.execute({
        actorUserId: cashier.id,
        from: new Date('2026-01-02T00:00:00.000Z'),
        to: new Date('2026-01-01T00:00:00.000Z'),
        page: 1,
        pageSize: 20,
      }),
    ).rejects.toThrow('From must be before To');

    await expect(
      getOrder.execute({ actorUserId: cashier.id, orderId: new OrderID('999999') }),
    ).rejects.toThrow('Order not found');
  });

  test('serializes concurrent additions with row locking', async () => {
    const server = await createUser(['SERVER']);
    const coffee = await createItem('Coffee', 750);
    const order = await openTableOrder.execute({ actorUserId: server.id, tableCode: 'T-01' });

    await Promise.all([
      addOrderItems.execute({
        actorUserId: server.id,
        orderId: order.id,
        lines: [{ itemId: coffee.id, quantity: 1 }],
      }),
      addOrderItems.execute({
        actorUserId: server.id,
        orderId: order.id,
        lines: [{ itemId: coffee.id, quantity: 1 }],
      }),
    ]);

    const saved = await unitOfWork.run((repos) => repos.orders.findById(order.id));
    expect(saved?.getItem(coffee.id)?.quantity).toBe(2);
    expect(saved?.total.cents).toBe(1500);
  });

  test('rejects disabled actors on every operation', async () => {
    const server = await createUser(['SERVER']);
    const order = await openTableOrder.execute({ actorUserId: server.id, tableCode: 'T-01' });

    await unitOfWork.run(async (repos) => {
      const user = await repos.users.findById(server.id);
      if (user === null) {
        throw new Error('Expected server user');
      }
      user.deactivate(clock.now());
      await repos.users.update(user);
    });

    await expect(
      unitOfWork.read((repos) => requireActor(repos, server.id, 'orders:update')),
    ).rejects.toThrow('Authentication required');

    await expect(
      addOrderItems.execute({
        actorUserId: server.id,
        orderId: order.id,
        lines: [{ itemId: new ItemID('1'), quantity: 1 }],
      }),
    ).rejects.toThrow('Authentication required');
  });
});

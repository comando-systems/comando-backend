import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { Clock } from '@/app/ports/clock';
import {
  AddOrderItemsUseCase,
  CancelOrderUseCase,
  ChangeOrderItemQuantityUseCase,
  CloseOrderUseCase,
  CreateCounterOrderUseCase,
  CreateItemUseCase,
  CreateUserUseCase,
  DeactivateUserUseCase,
  OpenTableOrderUseCase,
  RemoveItemUseCase,
  UpdateItemUseCase,
  UpdateUserUseCase,
} from '@/app/use-cases';
import type { Item } from '@/domain/entity/item';
import type { Role, User } from '@/domain/entity/user';
import type { Repositories } from '@/domain/repository';
import { BunPasswordHasher } from '@/infrastructure/authentication';
import type { DatabaseConnections } from '@/infrastructure/database/connections';
import { SequenceIdGenerator } from '@/infrastructure/database/sequence-id-generator';
import { DatabaseUnitOfWork } from '@/infrastructure/database/unit-of-work';
import { createRepositories } from '@/infrastructure/repositories';
import { createTestDatabase, resetDatabase, TEST_DATABASE_URL } from './support/database';

const now = new Date('2026-01-01T12:00:00.000Z');

const clock: Clock = { now: () => new Date(now.getTime()) };

describe.skipIf(!TEST_DATABASE_URL)('audit events', () => {
  let database: DatabaseConnections;
  let repositories: Repositories;
  let unitOfWork: DatabaseUnitOfWork;
  let createUser: CreateUserUseCase;
  let updateUser: UpdateUserUseCase;
  let deactivateUser: DeactivateUserUseCase;
  let createItem: CreateItemUseCase;
  let updateItem: UpdateItemUseCase;
  let removeItem: RemoveItemUseCase;
  let createCounterOrder: CreateCounterOrderUseCase;
  let openTableOrder: OpenTableOrderUseCase;
  let addOrderItems: AddOrderItemsUseCase;
  let changeOrderItemQuantity: ChangeOrderItemQuantityUseCase;
  let closeOrder: CloseOrderUseCase;
  let cancelOrder: CancelOrderUseCase;

  beforeAll(() => {
    database = createTestDatabase();
    repositories = createRepositories(database);
    unitOfWork = new DatabaseUnitOfWork(database, () => repositories);
    const orderIds = new SequenceIdGenerator(database.write, 'orders_id_seq');

    createUser = new CreateUserUseCase(unitOfWork, new BunPasswordHasher(), clock);
    updateUser = new UpdateUserUseCase(unitOfWork, new BunPasswordHasher(), clock);
    deactivateUser = new DeactivateUserUseCase(unitOfWork, clock);
    createItem = new CreateItemUseCase(unitOfWork, clock);
    updateItem = new UpdateItemUseCase(unitOfWork, clock);
    removeItem = new RemoveItemUseCase(unitOfWork, clock);
    createCounterOrder = new CreateCounterOrderUseCase(unitOfWork, orderIds, clock);
    openTableOrder = new OpenTableOrderUseCase(unitOfWork, orderIds, clock);
    addOrderItems = new AddOrderItemsUseCase(unitOfWork, clock);
    changeOrderItemQuantity = new ChangeOrderItemQuantityUseCase(unitOfWork, clock);
    closeOrder = new CloseOrderUseCase(unitOfWork, clock);
    cancelOrder = new CancelOrderUseCase(unitOfWork, clock);
  });

  beforeEach(async () => {
    await resetDatabase(database);
  });

  afterAll(async () => {
    await database.close();
  });

  async function createActor(roles: readonly Role[]): Promise<User> {
    return unitOfWork.run((repos) =>
      repos.users.create({
        name: `Actor ${crypto.randomUUID()}`,
        email: `actor-${crypto.randomUUID()}@example.com`,
        passwordHash: 'hash',
        roles,
        now,
      }),
    );
  }

  async function createCatalogItem(name = 'Coffee', priceCents = 750): Promise<Item> {
    return unitOfWork.run((repos) =>
      repos.items.create({
        name,
        description: null,
        priceCents,
        imageUrl: null,
        now,
      }),
    );
  }

  async function recentAuditEvents() {
    return unitOfWork.read((repos) => repos.audit.listRecent(100));
  }

  test('records administrative actions with actor, target, and request id', async () => {
    const admin = await createActor(['ADMIN']);

    const createdUser = await createUser.execute({
      actorUserId: admin.id,
      name: 'Target User',
      email: 'target@example.com',
      password: 'target-password',
      roles: ['CASHIER'],
      requestId: 'req-user-create',
    });
    await updateUser.execute({
      actorUserId: admin.id,
      userId: createdUser.id,
      name: 'Updated User',
      password: 'new-target-password',
      requestId: 'req-user-update',
    });
    await deactivateUser.execute({
      actorUserId: admin.id,
      userId: createdUser.id,
      requestId: 'req-user-deactivate',
    });

    const item = await createItem.execute({
      actorUserId: admin.id,
      name: 'Coffee',
      priceCents: 750,
      requestId: 'req-item-create',
    });
    await updateItem.execute({
      actorUserId: admin.id,
      itemId: item.id,
      priceCents: 900,
      requestId: 'req-item-update',
    });
    await removeItem.execute({
      actorUserId: admin.id,
      itemId: item.id,
      requestId: 'req-item-remove',
    });

    const events = await recentAuditEvents();
    const byAction = new Map(events.map((event) => [event.action, event]));

    expect(byAction.get('user.create')).toMatchObject({
      targetType: 'USER',
      targetId: createdUser.id.value,
      requestId: 'req-user-create',
    });
    expect(byAction.get('user.create')?.actorUserId?.value).toBe(admin.id.value);
    expect(byAction.get('user.update')?.requestId).toBe('req-user-update');
    expect(byAction.get('user.deactivate')?.requestId).toBe('req-user-deactivate');
    expect(byAction.get('item.create')).toMatchObject({
      targetType: 'ITEM',
      targetId: item.id.value,
      requestId: 'req-item-create',
      metadata: { priceCents: 750 },
    });
    expect(byAction.get('item.create')?.actorUserId?.value).toBe(admin.id.value);
    expect(byAction.get('item.update')?.metadata).toEqual({ priceCents: 900 });
    expect(byAction.get('item.remove')?.requestId).toBe('req-item-remove');

    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain('target-password');
    expect(serialized).not.toContain('new-target-password');
  });

  test('records order lifecycle actions and skips failed operations', async () => {
    const cashier = await createActor(['CASHIER']);
    const server = await createActor(['SERVER']);
    const item = await createCatalogItem('Coffee', 750);

    const counter = await createCounterOrder.execute({
      actorUserId: cashier.id,
      lines: [{ itemId: item.id, quantity: 2 }],
      payments: [{ method: 'CASH', amountCents: 1500 }],
      requestId: 'req-counter',
    });

    const table = await openTableOrder.execute({
      actorUserId: server.id,
      tableCode: 'T-01',
      requestId: 'req-table-open',
    });

    const beforeDuplicate = await recentAuditEvents();
    await expect(
      openTableOrder.execute({
        actorUserId: server.id,
        tableCode: 'T-01',
        requestId: 'req-table-duplicate',
      }),
    ).rejects.toThrow('Table already has an open order');
    const afterDuplicate = await recentAuditEvents();
    expect(afterDuplicate).toHaveLength(beforeDuplicate.length);
    expect(afterDuplicate.some((event) => event.requestId === 'req-table-duplicate')).toBe(false);

    await addOrderItems.execute({
      actorUserId: server.id,
      orderId: table.id,
      lines: [{ itemId: item.id, quantity: 2 }],
      requestId: 'req-items-add',
    });
    await changeOrderItemQuantity.execute({
      actorUserId: server.id,
      orderId: table.id,
      itemId: item.id,
      quantity: 3,
      requestId: 'req-quantity-change',
    });
    await closeOrder.execute({
      actorUserId: cashier.id,
      orderId: table.id,
      payments: [{ method: 'CASH', amountCents: 2250 }],
      requestId: 'req-close',
    });

    const toCancel = await openTableOrder.execute({
      actorUserId: server.id,
      tableCode: 'T-02',
      requestId: 'req-table-open-2',
    });
    await cancelOrder.execute({
      actorUserId: server.id,
      orderId: toCancel.id,
      requestId: 'req-cancel',
    });

    const events = await recentAuditEvents();

    const byAction = new Map(events.map((event) => [event.action, event]));
    expect(byAction.get('order.counter.create')).toMatchObject({
      targetType: 'ORDER',
      targetId: counter.id.value,
      requestId: 'req-counter',
      metadata: { totalCents: 1500, itemLines: 1, payments: 1 },
    });
    expect(byAction.get('order.counter.create')?.actorUserId?.value).toBe(cashier.id.value);
    expect(byAction.get('order.table.open')).toMatchObject({
      targetId: table.id.value,
      requestId: 'req-table-open',
      metadata: { tableCode: 'T-01' },
    });
    expect(byAction.get('order.table.open')?.actorUserId?.value).toBe(server.id.value);
    expect(byAction.get('order.items.add')).toMatchObject({
      requestId: 'req-items-add',
      metadata: {
        items: [{ itemId: item.id.value, quantity: 2 }],
        totalCents: 1500,
      },
    });
    expect(byAction.get('order.item.quantity.change')).toMatchObject({
      requestId: 'req-quantity-change',
      metadata: {
        itemId: item.id.value,
        quantity: 3,
        totalCents: 2250,
      },
    });
    expect(byAction.get('order.close')).toMatchObject({
      targetId: table.id.value,
      requestId: 'req-close',
      metadata: { totalCents: 2250, payments: 1 },
    });
    expect(byAction.get('order.close')?.actorUserId?.value).toBe(cashier.id.value);
    expect(byAction.get('order.cancel')).toMatchObject({
      targetId: toCancel.id.value,
      requestId: 'req-cancel',
    });

    expect(events.filter((event) => event.action === 'order.table.open')).toHaveLength(2);
  });
});

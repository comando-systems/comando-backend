import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { ConflictError, ForbiddenError, NotFoundError } from '@/app/errors';
import type { Clock } from '@/app/ports/clock';
import {
  CreateItemUseCase,
  GetItemUseCase,
  ListItemsUseCase,
  RemoveItemUseCase,
  UpdateItemUseCase,
} from '@/app/use-cases';
import { Order } from '@/domain/entity/order';
import type { RoleCode } from '@/domain/entity/role';
import type { User } from '@/domain/entity/user';
import type { Repositories } from '@/domain/repository';
import { ItemID, OrderID } from '@/domain/value-objects/ids';
import type { DatabaseConnections } from '@/infrastructure/database/connections';
import { SequenceIdGenerator } from '@/infrastructure/database/sequence-id-generator';
import { DatabaseUnitOfWork } from '@/infrastructure/database/unit-of-work';
import { createRepositories } from '@/infrastructure/repositories';
import { createTestDatabase, resetDatabase, TEST_DATABASE_URL } from './support/database';

const now = new Date('2026-01-01T12:00:00.000Z');

const clock: Clock = { now: () => new Date(now.getTime()) };

describe.skipIf(!TEST_DATABASE_URL)('item administration', () => {
  let database: DatabaseConnections;
  let repositories: Repositories;
  let unitOfWork: DatabaseUnitOfWork;
  let orderIds: SequenceIdGenerator;
  let createItem: CreateItemUseCase;
  let updateItem: UpdateItemUseCase;
  let removeItem: RemoveItemUseCase;
  let listItems: ListItemsUseCase;
  let getItem: GetItemUseCase;

  beforeAll(() => {
    database = createTestDatabase();
    repositories = createRepositories(database);
    unitOfWork = new DatabaseUnitOfWork(database, () => repositories);
    orderIds = new SequenceIdGenerator(() => database.writeSql(), 'orders_id_seq');
    createItem = new CreateItemUseCase(unitOfWork, clock);
    updateItem = new UpdateItemUseCase(unitOfWork, clock);
    removeItem = new RemoveItemUseCase(unitOfWork, clock);
    listItems = new ListItemsUseCase(unitOfWork);
    getItem = new GetItemUseCase(unitOfWork);
  });

  beforeEach(async () => {
    await resetDatabase(database);
  });

  afterAll(async () => {
    await database.close();
  });

  async function createUser(roles: readonly RoleCode[]): Promise<User> {
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

  test('creates, reads, updates, removes, and lists items', async () => {
    const admin = await createUser(['ADMIN']);

    const created = await createItem.execute({
      actorUserId: admin.id,
      name: ' Coffee ',
      description: ' Hot ',
      priceCents: 750,
      imageUrl: 'https://example.com/coffee.png',
    });

    expect(created.name).toBe('Coffee');
    expect(created.description).toBe('Hot');
    expect(created.price.cents).toBe(750);
    expect(created.isActive).toBe(true);

    const found = await getItem.execute({ actorUserId: admin.id, itemId: created.id });
    expect(found.id.value).toBe(created.id.value);

    const updated = await updateItem.execute({
      actorUserId: admin.id,
      itemId: created.id,
      name: 'Espresso',
      description: null,
      priceCents: 900,
    });

    expect(updated.name).toBe('Espresso');
    expect(updated.description).toBeNull();
    expect(updated.price.cents).toBe(900);

    const activePage = await listItems.execute({
      actorUserId: admin.id,
      page: 1,
      pageSize: 20,
    });
    expect(activePage.total).toBe(1);
    expect(activePage.items[0]?.id.value).toBe(created.id.value);

    const removed = await removeItem.execute({ actorUserId: admin.id, itemId: created.id });
    expect(removed.isActive).toBe(false);

    const afterRemoval = await listItems.execute({
      actorUserId: admin.id,
      page: 1,
      pageSize: 20,
    });
    expect(afterRemoval.total).toBe(0);

    const withRemoved = await listItems.execute({
      actorUserId: admin.id,
      page: 1,
      pageSize: 20,
      includeRemoved: true,
    });
    expect(withRemoved.total).toBe(1);
    expect(withRemoved.items[0]?.isActive).toBe(false);

    const removedItem = await getItem.execute({ actorUserId: admin.id, itemId: created.id });
    expect(removedItem.isActive).toBe(false);

    await expect(
      updateItem.execute({ actorUserId: admin.id, itemId: created.id, priceCents: 1000 }),
    ).rejects.toBeInstanceOf(ConflictError);

    await expect(
      removeItem.execute({ actorUserId: admin.id, itemId: created.id }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  test('denies item administration to non-admin roles', async () => {
    const admin = await createUser(['ADMIN']);
    const server = await createUser(['SERVER']);
    const item = await createItem.execute({
      actorUserId: admin.id,
      name: 'Coffee',
      priceCents: 750,
    });

    await expect(
      createItem.execute({ actorUserId: server.id, name: 'Tea', priceCents: 500 }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await expect(
      updateItem.execute({ actorUserId: server.id, itemId: item.id, priceCents: 800 }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const activePage = await listItems.execute({
      actorUserId: server.id,
      page: 1,
      pageSize: 20,
    });
    expect(activePage.total).toBe(1);

    await removeItem.execute({ actorUserId: admin.id, itemId: item.id });

    const hiddenRemoved = await listItems.execute({
      actorUserId: server.id,
      page: 1,
      pageSize: 20,
      includeRemoved: true,
    });
    expect(hiddenRemoved.total).toBe(0);

    await expect(
      getItem.execute({ actorUserId: server.id, itemId: item.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  test('rejects unknown items', async () => {
    const admin = await createUser(['ADMIN']);
    const unknownId = new ItemID('999999');

    await expect(
      getItem.execute({ actorUserId: admin.id, itemId: unknownId }),
    ).rejects.toBeInstanceOf(NotFoundError);

    await expect(
      updateItem.execute({ actorUserId: admin.id, itemId: unknownId, priceCents: 100 }),
    ).rejects.toBeInstanceOf(NotFoundError);

    await expect(
      removeItem.execute({ actorUserId: admin.id, itemId: unknownId }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  test('preserves historical order lines after the catalog item changes or is removed', async () => {
    const admin = await createUser(['ADMIN']);
    const cashier = await createUser(['CASHIER']);
    const item = await createItem.execute({
      actorUserId: admin.id,
      name: 'Coffee',
      priceCents: 750,
    });
    const order = Order.createCounter({
      id: new OrderID(await orderIds.next()),
      openedByUserId: cashier.id,
      lines: [{ item, quantity: 2 }],
      payments: [{ method: 'CASH', amountCents: 1500 }],
      now,
    });

    await unitOfWork.run((repos) => repos.orders.create(order));

    await updateItem.execute({
      actorUserId: admin.id,
      itemId: item.id,
      priceCents: 999,
    });
    await removeItem.execute({ actorUserId: admin.id, itemId: item.id });

    const saved = await unitOfWork.run((repos) => repos.orders.findById(order.id));
    const line = saved?.items[0];

    expect(saved?.status).toBe('CLOSED');
    expect(saved?.total.cents).toBe(1500);
    expect(line?.itemId.value).toBe(item.id.value);
    expect(line?.itemName).toBe('Coffee');
    expect(line?.unitPrice.cents).toBe(750);

    const active = await unitOfWork.run((repos) => repos.items.findSellableByIds([item.id]));
    expect(active).toHaveLength(0);
  });
});

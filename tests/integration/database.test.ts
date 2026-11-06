import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { Item } from '@/domain/entity/item';
import { Order } from '@/domain/entity/order';
import type { Repositories } from '@/domain/repository';
import { OrderID } from '@/domain/value-objects/ids';
import type { DatabaseConnections } from '@/infrastructure/database/connections';
import { SequenceIdGenerator } from '@/infrastructure/database/sequence-id-generator';
import { DatabaseUnitOfWork } from '@/infrastructure/database/unit-of-work';
import { createRepositories } from '@/infrastructure/repositories';
import { createTestDatabase, resetDatabase, TEST_DATABASE_URL } from './support/database';

const now = new Date('2026-01-01T12:00:00.000Z');

describe.skipIf(!TEST_DATABASE_URL)('database adapters', () => {
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

  test('answers the readiness ping on both connections', async () => {
    await expect(database.ping()).resolves.toBeUndefined();
  });

  test('runs read work inside an open transaction on the same connection', async () => {
    const result = await database.transaction(() => database.readOnly(async () => 'same-tx'));

    expect(result).toBe('same-tx');
  });

  test('runs read-only work through the unit of work', async () => {
    const item = await unitOfWork.run((repos) =>
      repos.items.create({
        name: 'Coffee',
        description: null,
        priceCents: 750,
        imageUrl: null,
        now,
      }),
    );

    const found = await unitOfWork.read((repos) => repos.items.findById(item.id));

    expect(found?.name).toBe('Coffee');
  });

  test('generates increasing identifiers from a sequence', async () => {
    const ids = new SequenceIdGenerator(() => database.writeSql(), 'orders_id_seq');
    const first = Number(await ids.next());
    const second = Number(await ids.next());

    expect(second).toBeGreaterThan(first);
  });

  test('drawing an id inside a transaction does not need a second connection', async () => {
    const ids = new SequenceIdGenerator(() => database.writeSql(), 'orders_id_seq');

    // More concurrent transactions than pool connections: if each took a second connection for
    // its id, every connection would be held by a transaction waiting for another and none
    // could finish.
    const drawn = await Promise.all(
      Array.from({ length: 40 }, () =>
        database.transaction(async () => {
          const id = await ids.next();
          await new Promise((resolve) => setTimeout(resolve, 50));
          return id;
        }),
      ),
    );

    expect(new Set(drawn).size).toBe(40);
  }, 20_000);

  test('sends structured values to the database as JSON', async () => {
    const rows = await database.write.query<{ value: { a: number } }[]>`
      SELECT ${database.write.json({ a: 1 })}::jsonb AS value
    `;

    expect(rows[0]?.value).toEqual({ a: 1 });
  });

  test('deletes a single order line', async () => {
    const user = await unitOfWork.run((repos) =>
      repos.users.create({
        name: 'Cashier',
        email: `cashier-${crypto.randomUUID()}@example.com`,
        passwordHash: 'hash',
        roles: ['CASHIER'],
        now,
      }),
    );
    const create = (name: string, priceCents: number): Promise<Item> =>
      unitOfWork.run((repos) =>
        repos.items.create({ name, description: null, priceCents, imageUrl: null, now }),
      );
    const coffee = await create('Coffee', 750);
    const cake = await create('Cake', 300);
    const order = Order.createCounter({
      id: new OrderID(
        await new SequenceIdGenerator(() => database.writeSql(), 'orders_id_seq').next(),
      ),
      openedByUserId: user.id,
      lines: [
        { item: coffee, quantity: 1 },
        { item: cake, quantity: 1 },
      ],
      payments: [{ method: 'CASH', amountCents: 1050 }],
      now,
    });
    await unitOfWork.run((repos) => repos.orders.create(order));

    await unitOfWork.run((repos) => repos.orderItems.delete(order.id, cake.id));

    const lines = await unitOfWork.run((repos) => repos.orderItems.findByOrderId(order.id));
    expect(lines.map((line) => line.itemId.value)).toEqual([coffee.id.value]);
  });
});

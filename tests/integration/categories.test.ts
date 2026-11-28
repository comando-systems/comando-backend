import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { Clock } from '@/app/ports/clock';
import { CreateItemUseCase, UpdateItemUseCase } from '@/app/use-cases';
import type { User } from '@/domain/entity/user';
import type { Repositories } from '@/domain/repository';
import { ItemID } from '@/domain/value-objects/ids';
import type { DatabaseConnections } from '@/infrastructure/database/connections';
import { DatabaseUnitOfWork } from '@/infrastructure/database/unit-of-work';
import { createRepositories } from '@/infrastructure/repositories';
import { catalogSeedItems } from '../../scripts/data/catalog';
import { createTestDatabase, resetDatabase, TEST_DATABASE_URL } from './support/database';

const now = new Date('2026-01-01T12:00:00.000Z');
const clock: Clock = { now: () => new Date(now.getTime()) };
const ROOT_EMAIL = 'catalog-seed-root@example.com';

interface SeedResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

async function seedCatalog(): Promise<SeedResult> {
  if (!TEST_DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL is required');
  }

  const child = Bun.spawn(['bun', 'scripts/seed-items.ts'], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_READ_URL: TEST_DATABASE_URL,
      DATABASE_WRITE_URL: TEST_DATABASE_URL,
      ROOT_EMAIL,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  return { exitCode, stdout, stderr };
}

describe.skipIf(!TEST_DATABASE_URL)('item categories', () => {
  let database: DatabaseConnections;
  let repositories: Repositories;
  let unitOfWork: DatabaseUnitOfWork;
  let createItem: CreateItemUseCase;
  let updateItem: UpdateItemUseCase;

  beforeAll(() => {
    database = createTestDatabase();
    repositories = createRepositories(database);
    unitOfWork = new DatabaseUnitOfWork(database, () => repositories);
    createItem = new CreateItemUseCase(unitOfWork, clock);
    updateItem = new UpdateItemUseCase(unitOfWork, clock);
  });

  beforeEach(async () => {
    await resetDatabase(database);
  });

  afterAll(async () => {
    await database.close();
  });

  async function createAdmin(): Promise<User> {
    return unitOfWork.run((repos) =>
      repos.users.create({
        name: 'Catalog Admin',
        email: 'catalog-admin@example.com',
        passwordHash: 'hash',
        roles: ['ADMIN'],
        now,
      }),
    );
  }

  test('checks item names case-insensitively', async () => {
    const admin = await createAdmin();
    await createItem.execute({
      actorUserId: admin.id,
      name: 'Espresso',
      priceCents: 750,
      categories: ['Cafés'],
    });

    expect(await repositories.items.existsByName('espresso')).toBe(true);
    expect(await repositories.items.existsByName('Cappuccino')).toBe(false);
  });

  test('persists and hydrates multiple categories', async () => {
    const admin = await createAdmin();
    const item = await createItem.execute({
      actorUserId: admin.id,
      name: 'Espresso',
      priceCents: 750,
      categories: ['Cafés', 'Bebidas quentes', 'Vegano'],
    });

    expect(item.category).toBe('Cafés');
    expect(item.categories).toEqual(['Cafés', 'Bebidas quentes', 'Vegano']);

    const found = await repositories.items.findById(item.id);

    expect(found?.categories).toEqual(['Cafés', 'Bebidas quentes', 'Vegano']);
    expect(found?.category).toBe('Cafés');

    const page = await repositories.items.list({ page: 1, pageSize: 10 });
    expect(page.items[0]?.categories).toEqual(found?.categories);

    const sellable = await repositories.items.findSellableByIds([item.id]);
    expect(sellable[0]?.categories).toEqual(found?.categories);
  });

  test('replaces the association set without deleting shared categories', async () => {
    const admin = await createAdmin();
    const item = await createItem.execute({
      actorUserId: admin.id,
      name: 'Espresso',
      priceCents: 750,
      categories: ['Cafés', 'Vegano'],
    });
    const other = await createItem.execute({
      actorUserId: admin.id,
      name: 'Cappuccino',
      priceCents: 1200,
      categories: ['Cafés', 'Com leite'],
    });

    await updateItem.execute({
      actorUserId: admin.id,
      itemId: item.id,
      categories: ['Bebidas quentes'],
    });

    expect((await repositories.items.findById(item.id))?.categories).toEqual(['Bebidas quentes']);
    expect((await repositories.items.findById(other.id))?.categories).toEqual([
      'Cafés',
      'Com leite',
    ]);

    const categories = await database.write.query<{ name: string }[]>`
      SELECT name FROM categories ORDER BY name
    `;
    expect(categories.map((row) => row.name)).toEqual([
      'Bebidas quentes',
      'Cafés',
      'Com leite',
      'Vegano',
    ]);
  });

  test('enforces category constraints and cascades associations with the item', async () => {
    await database.write.query`
      INSERT INTO categories (name, normalized_name) VALUES ('Drinks', 'drinks')
    `;

    await expect(
      database.write.query`
        INSERT INTO categories (name, normalized_name) VALUES ('drinks', 'drinks')
      `,
    ).rejects.toThrow();
    await expect(
      database.write.query`
        INSERT INTO categories (name, normalized_name) VALUES ('   ', '   ')
      `,
    ).rejects.toThrow();

    const admin = await createAdmin();
    const item = await createItem.execute({
      actorUserId: admin.id,
      name: 'Espresso',
      priceCents: 750,
      categories: ['Drinks'],
    });
    const categoryId = (
      await database.write.query<{ id: string }[]>`
      SELECT id::text AS id FROM categories WHERE normalized_name = 'drinks'
    `
    )[0]?.id;

    await expect(
      database.write.query`DELETE FROM categories WHERE id = ${categoryId}`,
    ).rejects.toThrow();

    await database.write.query`DELETE FROM items WHERE id = ${item.id.value}`;

    const links = await database.write.query<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM item_categories WHERE item_id = ${item.id.value}
    `;
    expect(links[0]?.count).toBe(0);
  });

  test('seeds the curated catalog once and is idempotent', async () => {
    await unitOfWork.run((repos) =>
      repos.users.create({
        name: 'Catalog Admin',
        email: ROOT_EMAIL,
        passwordHash: 'hash',
        roles: ['ADMIN', 'CASHIER', 'SERVER'],
        now,
      }),
    );

    const first = await seedCatalog();

    expect({ exitCode: first.exitCode, stderr: first.stderr }).toEqual({
      exitCode: 0,
      stderr: '',
    });
    expect(first.stdout).toContain(`${catalogSeedItems.length} created`);

    const second = await seedCatalog();

    expect({ exitCode: second.exitCode, stderr: second.stderr }).toEqual({
      exitCode: 0,
      stderr: '',
    });
    expect(second.stdout).toContain(`${catalogSeedItems.length} already present`);

    const items = await database.write.query<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM items
    `;
    expect(items[0]?.count).toBe(catalogSeedItems.length);

    const linked = await database.write.query<{ count: number }[]>`
      SELECT COUNT(DISTINCT item_id)::int AS count FROM item_categories
    `;
    expect(linked[0]?.count).toBe(catalogSeedItems.length);

    const espressoRow = await database.write.query<{ id: string }[]>`
      SELECT id::text AS id FROM items WHERE name = 'Espresso'
    `;
    const espresso = await repositories.items.findById(new ItemID(espressoRow[0]?.id ?? '1'));
    expect(espresso?.categories).toEqual(['Cafés', 'Bebidas quentes', 'Vegano']);
  });
});

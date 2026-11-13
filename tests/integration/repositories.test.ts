import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { Repositories } from '@/domain/repository';
import type { DatabaseConnections } from '@/infrastructure/database/connections';
import { createRepositories } from '@/infrastructure/repositories';
import { createTestDatabase, resetDatabase, TEST_DATABASE_URL } from './support/database';

const now = new Date('2026-01-01T12:00:00.000Z');

describe.skipIf(!TEST_DATABASE_URL)('role and assignment repositories', () => {
  let database: DatabaseConnections;
  let repositories: Repositories;

  beforeAll(() => {
    database = createTestDatabase();
    repositories = createRepositories(database);
  });

  beforeEach(async () => {
    await resetDatabase(database);
  });

  afterAll(async () => {
    await database.close();
  });

  test('returns nothing for an empty lookup', async () => {
    expect(await repositories.roles.findByCodes([])).toEqual([]);
    expect(await repositories.roles.findByIds([])).toEqual([]);
    expect(await repositories.userRoles.findByUserIds([])).toEqual(new Map());
  });

  test('loads roles and assignments by code, id, and user', async () => {
    const user = await repositories.users.create({
      name: 'Ada Lovelace',
      email: `ada-${crypto.randomUUID()}@example.com`,
      passwordHash: 'hash',
      roles: ['CASHIER', 'ADMIN'],
      now,
    });

    const byCode = await repositories.roles.findByCodes(['ADMIN', 'CASHIER']);
    expect(byCode.map((role) => role.code)).toEqual(['ADMIN', 'CASHIER']);

    const byId = await repositories.roles.findByIds(byCode.map((role) => role.id));
    expect(byId.map((role) => role.code)).toEqual(['ADMIN', 'CASHIER']);

    const assignments = await repositories.userRoles.findByUserId(user.id);
    expect(assignments.map((assignment) => assignment.roleId.value)).toEqual(
      byCode.map((role) => role.id.value),
    );

    const grouped = await repositories.userRoles.findByUserIds([user.id]);
    expect(grouped.get(user.id.value)).toHaveLength(2);
    expect(await repositories.userRoles.countActiveAdmins()).toBe(1);
  });
});

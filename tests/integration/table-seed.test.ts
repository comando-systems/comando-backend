import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { DatabaseConnections } from '@/infrastructure/database/connections';
import { createTestDatabase, resetDatabase, TEST_DATABASE_URL } from './support/database';

const ROOT_EMAIL = 'table-seed-root@example.com';

interface SeedResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

async function seedTables(): Promise<SeedResult> {
  if (!TEST_DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL is required');
  }

  const child = Bun.spawn(['bun', 'scripts/seed-tables.ts'], {
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

describe.skipIf(!TEST_DATABASE_URL)('default table seed', () => {
  let database: DatabaseConnections;

  beforeAll(() => {
    database = createTestDatabase();
  });

  beforeEach(async () => {
    await resetDatabase(database);
    await database.write.query`
      INSERT INTO users (name, email, password_hash, created_at, updated_at)
      VALUES ('Root', ${ROOT_EMAIL}, 'hash', now(), now())
    `;
    await database.write.query`
      INSERT INTO user_roles (user_id, role_id, assigned_at)
      SELECT u.id, r.id, now() FROM users u CROSS JOIN roles r
      WHERE u.email = ${ROOT_EMAIL}
    `;
  });

  afterAll(async () => {
    await database.close();
  });

  test('creates 20 open tables once and is idempotent', async () => {
    const first = await seedTables();

    expect({ exitCode: first.exitCode, stderr: first.stderr }).toEqual({
      exitCode: 0,
      stderr: '',
    });
    expect(first.stdout).toContain('20 created');

    const rows = await database.write.query<{ table_code: string; status: string }[]>`
      SELECT table_code, status FROM orders WHERE order_type = 'TABLE' ORDER BY table_code
    `;

    expect(rows).toHaveLength(20);
    expect(rows.map((row) => row.table_code)).toEqual(
      Array.from({ length: 20 }, (_, index) => `Mesa ${String(index + 1).padStart(2, '0')}`),
    );
    expect(rows.every((row) => row.status === 'OPEN')).toBe(true);

    const second = await seedTables();

    expect({ exitCode: second.exitCode, stderr: second.stderr }).toEqual({
      exitCode: 0,
      stderr: '',
    });
    expect(second.stdout).toContain('20 already active');

    const count = await database.write.query<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM orders WHERE order_type = 'TABLE'
    `;
    expect(count[0]?.count).toBe(20);
  });
});

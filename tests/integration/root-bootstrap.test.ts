import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { DatabaseConnections } from '@/infrastructure/database/connections';
import { createTestDatabase, resetDatabase, TEST_DATABASE_URL } from './support/database';

const ROOT_EMAIL = 'root-bootstrap@example.com';
const ROOT_PASSWORD = 'root-bootstrap-password-123';

interface SeedResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

async function seedRoot(): Promise<SeedResult> {
  if (!TEST_DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL is required');
  }

  const child = Bun.spawn(['bun', 'scripts/seed-root-user.ts'], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_WRITE_URL: TEST_DATABASE_URL,
      ROOT_EMAIL,
      ROOT_PASSWORD,
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

describe.skipIf(!TEST_DATABASE_URL)('root bootstrap', () => {
  let database: DatabaseConnections;

  beforeAll(() => {
    database = createTestDatabase();
  });

  beforeEach(async () => {
    await resetDatabase(database);
  });

  afterAll(async () => {
    await database.close();
  });

  test('creates one root user with all roles and is idempotent', async () => {
    const first = await seedRoot();

    expect({ exitCode: first.exitCode, stderr: first.stderr }).toEqual({
      exitCode: 0,
      stderr: '',
    });
    expect(first.stdout).toContain('Root user created');

    const users = await database.write.query<
      { id: number; email: string; password_hash: string }[]
    >`SELECT id, email, password_hash FROM users WHERE email = ${ROOT_EMAIL}`;

    expect(users).toHaveLength(1);
    expect(users[0]?.email).toBe(ROOT_EMAIL);
    expect(users[0]?.password_hash).not.toBe(ROOT_PASSWORD);

    const roles = await database.write.query<{ code: string }[]>`
      SELECT r.code FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ${users[0]?.id}
      ORDER BY r.code
    `;

    expect(roles.map((role) => role.code)).toEqual(['ADMIN', 'CASHIER', 'SERVER']);

    const second = await seedRoot();

    expect({ exitCode: second.exitCode, stderr: second.stderr }).toEqual({
      exitCode: 0,
      stderr: '',
    });
    expect(second.stdout).toContain('Root user already exists');

    const count = await database.write.query<
      { count: number }[]
    >`SELECT COUNT(*)::int AS count FROM users`;
    expect(count[0]?.count).toBe(1);
  });
});

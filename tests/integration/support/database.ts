import {
  createDatabaseConnections,
  type DatabaseConnections,
} from '@/infrastructure/database/connections';
import { JsonLogger } from '@/infrastructure/logging/json-logger';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

export function createTestDatabase(): DatabaseConnections {
  if (!TEST_DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL is required for integration tests');
  }

  return createDatabaseConnections(TEST_DATABASE_URL, TEST_DATABASE_URL, new JsonLogger('error'));
}

export async function resetDatabase(database: DatabaseConnections): Promise<void> {
  await database.write`
    TRUNCATE TABLE
      audit_logs,
      order_payments,
      order_items,
      orders,
      items,
      verifications,
      accounts,
      sessions,
      users
    RESTART IDENTITY CASCADE
  `;
}

// Better Auth owns user creation, so tests insert rows directly.
export async function insertUser(
  database: DatabaseConnections,
  input: { roles?: readonly string[]; banned?: boolean } = {},
): Promise<{ id: string; email: string }> {
  const email = `user-${crypto.randomUUID()}@example.com`;
  const rows = await database.write<{ id: string }[]>`
    INSERT INTO users (name, email, role, banned)
    VALUES (
      'Test User',
      ${email},
      ${(input.roles ?? ['ADMIN']).join(',')},
      ${input.banned ?? false}
    )
    RETURNING id::text AS id
  `;

  const row = rows[0];
  if (!row) {
    throw new Error('Failed to insert test user');
  }

  return { id: row.id, email };
}

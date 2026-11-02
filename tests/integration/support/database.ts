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
      refresh_tokens,
      order_payments,
      order_items,
      orders,
      items,
      user_roles,
      users
    RESTART IDENTITY CASCADE
  `;
}

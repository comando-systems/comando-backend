import { AsyncLocalStorage } from 'node:async_hooks';
import type { Logger } from '@/app/ports/logger';
import { createSqlClient, type Sql } from '@/infrastructure/database/postgres';

export interface DatabaseConnections {
  readonly read: Sql;
  readonly write: Sql;
  readSql(): Sql;
  writeSql(): Sql;
  transaction<T>(work: () => Promise<T>): Promise<T>;
  readOnly<T>(work: () => Promise<T>): Promise<T>;
  ping(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Holds separate read and write connections. Repositories are created once and
 * resolve the active transaction through async-local storage, so a transaction
 * is visible to every repository without recreating them per request.
 */
export function createDatabaseConnections(
  readUrl: string,
  writeUrl: string,
  logger: Logger,
): DatabaseConnections {
  const read = createSqlClient(readUrl);
  const write = createSqlClient(writeUrl);
  const transactionStorage = new AsyncLocalStorage<Sql>();

  return {
    read,
    write,
    readSql(): Sql {
      return transactionStorage.getStore() ?? read;
    },
    writeSql(): Sql {
      return transactionStorage.getStore() ?? write;
    },
    async transaction<T>(work: () => Promise<T>): Promise<T> {
      const result = await write.begin(async (transaction) => {
        return transactionStorage.run(transaction as unknown as Sql, work);
      });
      return result as T;
    },
    async readOnly<T>(work: () => Promise<T>): Promise<T> {
      if (transactionStorage.getStore() !== undefined) {
        return work();
      }
      return transactionStorage.run(read, work);
    },
    async ping(): Promise<void> {
      await Promise.all([read`SELECT 1`, write`SELECT 1`]);
    },
    async close(): Promise<void> {
      await Promise.all([read.end({ timeout: 5 }), write.end({ timeout: 5 })]);
      logger.debug('database connections closed');
    },
  };
}

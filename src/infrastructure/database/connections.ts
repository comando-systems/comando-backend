import { AsyncLocalStorage } from 'node:async_hooks';
import type { Logger } from '@/app/ports/logger';
import { SqlClient } from '@/infrastructure/database/sql-client';

export interface DatabaseConnections {
  readonly read: SqlClient;
  readonly write: SqlClient;
  readSql(): SqlClient;
  writeSql(): SqlClient;
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
  const read = SqlClient.connect(readUrl, {
    max: 10,
    idleTimeout: 20,
    connectionTimeout: 10,
  });
  const write = SqlClient.connect(writeUrl, {
    max: 10,
    idleTimeout: 20,
    connectionTimeout: 10,
  });
  const transactionStorage = new AsyncLocalStorage<SqlClient>();

  return {
    read,
    write,
    readSql(): SqlClient {
      return transactionStorage.getStore() ?? read;
    },
    writeSql(): SqlClient {
      return transactionStorage.getStore() ?? write;
    },
    async transaction<T>(work: () => Promise<T>): Promise<T> {
      return write.transaction((transaction) => transactionStorage.run(transaction, work));
    },
    async readOnly<T>(work: () => Promise<T>): Promise<T> {
      if (transactionStorage.getStore() !== undefined) {
        return work();
      }
      return transactionStorage.run(read, work);
    },
    async ping(): Promise<void> {
      await Promise.all([read.ping(), write.ping()]);
    },
    async close(): Promise<void> {
      await Promise.all([read.close(5), write.close(5)]);
      logger.debug('database connections closed');
    },
  };
}

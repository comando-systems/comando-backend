import postgres from 'postgres';
import type { Logger } from '@/app/ports/logger';

export type Sql = postgres.Sql;

export interface DatabaseConnection {
  readonly sql: Sql;
  ping(): Promise<void>;
  close(): Promise<void>;
}

export function createDatabaseConnection(databaseUrl: string, logger: Logger): DatabaseConnection {
  const sql = postgres(databaseUrl, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => undefined,
  });

  return {
    sql,
    async ping(): Promise<void> {
      await sql`SELECT 1`;
    },
    async close(): Promise<void> {
      await sql.end({ timeout: 5 });
      logger.debug('database connection closed');
    },
  };
}

import postgres from 'postgres';

export type Sql = postgres.Sql;

export function createSqlClient(databaseUrl: string): Sql {
  return postgres(databaseUrl, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => undefined,
  });
}

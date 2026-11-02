// Shared Bun SQL connection used by every repository.
import { SQL } from "bun";
import { getDatabaseUrl } from "@/app/config/env";

// `SQL.camel` maps snake_case columns to camelCase object keys.
// `bigint` keeps int8 values exact; repositories convert ids to numbers.
export const db = new SQL(getDatabaseUrl(), {
  bigint: true,
  transform: SQL.camel,
});

/** Query executor shared by repositories; transactions are also SQL clients. */
export type DbExecutor = SQL;

/** Closes the connection pool after pending queries finish. */
export async function closeDatabase(): Promise<void> {
  await db.close({ timeout: 5 });
}

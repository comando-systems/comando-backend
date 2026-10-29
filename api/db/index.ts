import { drizzle } from "drizzle-orm/postgres-js";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getDatabaseUrl } from "@/app/config/env";
import * as schema from "./schema";

const client = postgres(getDatabaseUrl());

export const db = drizzle(client, { schema });

export type DbExecutor = PgDatabase<PostgresJsQueryResultHKT, typeof schema>;

export async function closeDatabase(): Promise<void> {
  await client.end({ timeout: 5 });
}

export { schema };

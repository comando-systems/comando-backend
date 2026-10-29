import { migrate } from "drizzle-orm/postgres-js/migrator";
import { closeDatabase, db } from "@/db";

try {
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Database migrations applied.");
} finally {
  await closeDatabase();
}

// Transaction boundary abstraction that keeps services testable.
import { db, type DbExecutor } from "@/db";

/** Runs a unit of work inside a single database transaction. */
export interface TransactionManager {
  transaction<T>(
    work: (client: DbExecutor | undefined) => Promise<T>,
  ): Promise<T>;
}

/** Production transaction manager backed by Bun SQL. */
export const databaseTransactions: TransactionManager = {
  transaction: (work) => db.begin((client) => work(client)),
};

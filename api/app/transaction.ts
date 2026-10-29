import { db, type DbExecutor } from "@/db";

export interface TransactionManager {
  transaction<T>(
    work: (client: DbExecutor | undefined) => Promise<T>,
  ): Promise<T>;
}

export const databaseTransactions: TransactionManager = {
  transaction: (work) => db.transaction((tx) => work(tx)),
};

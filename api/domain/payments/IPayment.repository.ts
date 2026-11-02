// Persistence contract for session payments; optional executor supports transactions.
import type { DbExecutor } from "@/db";
import type { NewPayment, Payment } from ".";

export interface IPaymentRepository {
  findBySessionId(
    sessionId: number,
    client?: DbExecutor,
  ): Promise<Payment[]>;
  create(data: NewPayment, client?: DbExecutor): Promise<Payment>;
}

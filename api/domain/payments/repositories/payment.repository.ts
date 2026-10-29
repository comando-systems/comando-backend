import { asc, eq } from "drizzle-orm";
import { db, type DbExecutor } from "@/db";
import { requireRow } from "@/db/helpers";
import {
  payments,
  type NewPayment,
  type Payment,
} from "@/db/schema/payments";

export interface IPaymentRepository {
  findBySessionId(
    sessionId: number,
    client?: DbExecutor,
  ): Promise<Payment[]>;
  create(data: NewPayment, client?: DbExecutor): Promise<Payment>;
}

export class PaymentRepository implements IPaymentRepository {
  async findBySessionId(
    sessionId: number,
    client: DbExecutor = db,
  ): Promise<Payment[]> {
    return client
      .select()
      .from(payments)
      .where(eq(payments.sessionId, sessionId))
      .orderBy(asc(payments.paidAt), asc(payments.id));
  }

  async create(
    data: NewPayment,
    client: DbExecutor = db,
  ): Promise<Payment> {
    const [payment] = await client
      .insert(payments)
      .values(data)
      .returning();
    return requireRow(payment, "Failed to create payment");
  }
}

export const paymentRepository = new PaymentRepository();

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { payments, type NewPayment, type Payment } from "@/db/schema/payments";

export interface IPaymentRepository {
  findBySessionId(sessionId: number): Promise<Payment[]>;
  create(data: NewPayment): Promise<Payment>;
  sumBySessionId(sessionId: number): Promise<number>;
}

export class PaymentRepository implements IPaymentRepository {
  async findBySessionId(sessionId: number): Promise<Payment[]> {
    return db.select().from(payments).where(eq(payments.sessionId, sessionId));
  }

  async create(data: NewPayment): Promise<Payment> {
    const [payment] = await db.insert(payments).values(data).returning();
    return payment;
  }

  async sumBySessionId(sessionId: number): Promise<number> {
    const result = await db
      .select({ amount: payments.amount })
      .from(payments)
      .where(eq(payments.sessionId, sessionId));

    return result.reduce((sum, p) => sum + Number(p.amount), 0);
  }
}

export const paymentRepository = new PaymentRepository();

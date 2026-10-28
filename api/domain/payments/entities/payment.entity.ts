import type { Payment } from "@/db/schema/payments";

export class PaymentEntity implements Payment {
  id!: number;
  sessionId!: number;
  amount!: string;
  method!: "CASH" | "CREDIT_CARD" | "DEBIT_CARD" | "PIX" | "OTHER";
  receivedBy!: number;
  paidAt!: Date;
  notes!: string | null;

  static create(
    sessionId: number,
    amount: number,
    method: Payment["method"],
    receivedBy: number,
    notes?: string,
  ): PaymentEntity {
    const entity = new PaymentEntity();
    entity.sessionId = sessionId;
    entity.amount = amount.toFixed(2);
    entity.method = method;
    entity.receivedBy = receivedBy;
    entity.paidAt = new Date();
    entity.notes = notes ?? null;
    return entity;
  }

  getAmountInCents(): number {
    return Math.round(Number(this.amount) * 100);
  }
}

import type { Payment, PaymentMethod } from "@/db/schema/payments";
import { decimalToCents } from "@/domain/money/money";

export interface PublicPayment {
  id: number;
  sessionId: number;
  amountCents: number;
  method: PaymentMethod;
  receivedBy: number;
  paidAt: Date;
  notes: string | null;
}

export function toPublicPayment(payment: Payment): PublicPayment {
  return {
    id: payment.id,
    sessionId: payment.sessionId,
    amountCents: decimalToCents(payment.amount),
    method: payment.method,
    receivedBy: payment.receivedBy,
    paidAt: payment.paidAt,
    notes: payment.notes,
  };
}

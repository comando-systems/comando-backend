// Maps persisted payments (decimal) to the public cents-based contract.
import { decimalToCents } from "@/domain/money";
import type { Payment, PublicPayment } from ".";

/** Converts a payment row into the API shape. */
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

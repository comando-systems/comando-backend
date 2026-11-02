// Payment domain model, persistence input, and public cents-based contracts.
import type { PaymentMethod } from "./enums";

export interface Payment {
  id: number;
  sessionId: number;
  amount: string;
  method: PaymentMethod;
  receivedBy: number;
  paidAt: Date;
  notes: string | null;
}

export type NewPayment = Pick<
  Payment,
  "sessionId" | "amount" | "method" | "receivedBy"
> &
  Partial<Pick<Payment, "paidAt" | "notes">>;

export type PublicPayment = Omit<Payment, "amount"> & {
  amountCents: number;
};

export type CreatePaymentInput = Pick<Payment, "method"> & {
  amountCents: number;
  notes?: string | null;
};

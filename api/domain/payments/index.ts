// Public barrel for the payments domain module.
import type { PaymentMethod } from "./enums";

/** Payment domain model; amount is stored as a numeric decimal string. */
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

export * from "./enums";
export * from "./IPayment.repository";
export * from "./payment.presenter";
export * from "./rules";

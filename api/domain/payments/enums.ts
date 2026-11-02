// Payment methods mirror the PostgreSQL enum and are validated at HTTP boundaries.
export const PAYMENT_METHODS = [
  "CASH",
  "CREDIT_CARD",
  "DEBIT_CARD",
  "PIX",
  "OTHER",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

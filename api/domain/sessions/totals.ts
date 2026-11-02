// Pure session total calculation over persisted decimal values.
import { decimalToCents, subtotalCents } from "@/domain/money";
import type {
  PaymentAmount,
  PricedItem,
  SessionTotals,
} from "./types";

/** Sums active items at their historical price and subtracts all payments. */
export function calculateSessionTotals(
  items: readonly PricedItem[],
  payments: readonly PaymentAmount[],
): SessionTotals {
  const itemsCents = items
    .filter((item) => item.status === "ACTIVE")
    .reduce(
      (total, item) =>
        total +
        subtotalCents(decimalToCents(item.unitPrice), Number(item.quantity)),
      0,
    );

  const paidCents = payments.reduce(
    (total, payment) => total + decimalToCents(payment.amount),
    0,
  );

  return {
    itemsCents,
    paidCents,
    balanceCents: itemsCents - paidCents,
  };
}

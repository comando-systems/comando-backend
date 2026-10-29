import { decimalToCents, subtotalCents } from "@/domain/money/money";

export interface PricedItem {
  unitPrice: string;
  quantity: string;
  status: "ACTIVE" | "REMOVED";
}

export interface PaymentAmount {
  amount: string;
}

export interface SessionTotals {
  itemsCents: number;
  paidCents: number;
  balanceCents: number;
}

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

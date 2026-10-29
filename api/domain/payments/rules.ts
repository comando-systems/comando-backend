import { ConflictError } from "@/app/errors";
import type { SessionTotals } from "@/domain/sessions/totals";

export function assertPaymentAllowed(
  totals: SessionTotals,
  amountCents: number,
): void {
  if (totals.itemsCents === 0) {
    throw new ConflictError(
      "SESSION_HAS_NO_ITEMS",
      "Session has no active items to pay",
    );
  }

  if (totals.balanceCents <= 0) {
    throw new ConflictError(
      "SESSION_ALREADY_PAID",
      "Session has no outstanding balance",
    );
  }

  if (amountCents > totals.balanceCents) {
    throw new ConflictError(
      "PAYMENT_EXCEEDS_BALANCE",
      "Payment exceeds the outstanding balance",
      { balanceCents: totals.balanceCents },
    );
  }
}

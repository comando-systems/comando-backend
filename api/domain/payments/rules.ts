// Payment invariants: only sessions with active items and an outstanding
// balance accept payments, and partial payments may not overpay the session.
import { ConflictError } from "@/app/errors";
import type { SessionTotals } from "@/domain/sessions";

/** Throws a domain conflict when a payment would violate session totals. */
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

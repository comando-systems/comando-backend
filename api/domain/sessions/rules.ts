// Session state invariants shared by the HTTP and application layers.
import { ConflictError, NotFoundError, ValidationError } from "@/app/errors";
import type { SessionStatus, SessionType } from "./enums";
import type { ServiceSession, SessionTotals } from ".";

/** Narrows a lookup result to an existing session. */
export function requireSession(
  session: ServiceSession | undefined,
): ServiceSession {
  if (!session) {
    throw new NotFoundError("Session not found", "SESSION_NOT_FOUND");
  }

  return session;
}

/** Only OPEN sessions may accept item or payment changes. */
export function assertSessionOpen(session: { status: SessionStatus }): void {
  if (session.status !== "OPEN") {
    throw new ConflictError("SESSION_NOT_OPEN", "Session is not open");
  }
}

/** TABLE sessions require a table number; COUNTER sessions must omit it. */
export function assertTableAssignment(input: {
  type: SessionType;
  tableNumber?: number;
}): void {
  if (input.type === "TABLE" && input.tableNumber === undefined) {
    throw new ValidationError(
      "tableNumber is required for table sessions",
      "tableNumber",
    );
  }

  if (input.type === "COUNTER" && input.tableNumber !== undefined) {
    throw new ValidationError(
      "tableNumber is not allowed for counter sessions",
      "tableNumber",
    );
  }
}

/** A session can only close when active items and payments balance to zero. */
export function assertSessionSettled(totals: SessionTotals): void {
  if (totals.balanceCents !== 0) {
    throw new ConflictError(
      "OUTSTANDING_BALANCE",
      "Session has an outstanding balance",
      { balanceCents: totals.balanceCents },
    );
  }
}

/** Sessions with registered payments must be refunded/adjusted, not cancelled. */
export function assertSessionCanBeCancelled(paymentCount: number): void {
  if (paymentCount > 0) {
    throw new ConflictError(
      "SESSION_HAS_PAYMENTS",
      "Session with registered payments cannot be cancelled",
    );
  }
}

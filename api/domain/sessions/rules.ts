import { ConflictError, ValidationError } from "@/app/errors";
import type {
  ServiceSessionStatus,
  ServiceSessionType,
} from "@/db/schema/sessions";
import type { SessionTotals } from "./totals";

export function assertSessionOpen(session: {
  status: ServiceSessionStatus;
}): void {
  if (session.status !== "OPEN") {
    throw new ConflictError("SESSION_NOT_OPEN", "Session is not open");
  }
}

export function assertTableAssignment(input: {
  type: ServiceSessionType;
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

export function assertSessionSettled(totals: SessionTotals): void {
  if (totals.balanceCents !== 0) {
    throw new ConflictError(
      "OUTSTANDING_BALANCE",
      "Session has an outstanding balance",
      { balanceCents: totals.balanceCents },
    );
  }
}

export function assertSessionCanBeCancelled(paymentCount: number): void {
  if (paymentCount > 0) {
    throw new ConflictError(
      "SESSION_HAS_PAYMENTS",
      "Session with registered payments cannot be cancelled",
    );
  }
}

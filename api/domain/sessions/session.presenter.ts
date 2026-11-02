// Maps session and item rows to the public cents-based contract.
import { decimalToCents, subtotalCents } from "@/domain/money";
import type {
  PublicSession,
  PublicSessionItem,
  ServiceSession,
  SessionItem,
} from ".";

/** Converts a session row into the API shape. */
export function toPublicSession(session: ServiceSession): PublicSession {
  return {
    id: session.id,
    type: session.type,
    status: session.status,
    tableNumber: session.tableNumber,
    openedBy: session.openedBy,
    closedBy: session.closedBy,
    openedAt: session.openedAt,
    closedAt: session.closedAt,
    notes: session.notes,
  };
}

export function toPublicSessionItem(item: SessionItem): PublicSessionItem {
  const unitPriceCents = decimalToCents(item.unitPrice);
  const quantity = Number(item.quantity);

  return {
    id: item.id,
    sessionId: item.sessionId,
    productId: item.productId,
    quantity,
    unitPriceCents,
    subtotalCents: subtotalCents(unitPriceCents, quantity),
    status: item.status,
    addedBy: item.addedBy,
    addedAt: item.addedAt,
    updatedAt: item.updatedAt,
    removedBy: item.removedBy,
    removedAt: item.removedAt,
  };
}

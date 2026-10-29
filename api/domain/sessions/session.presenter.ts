import type {
  ServiceSession,
  ServiceSessionStatus,
  ServiceSessionType,
  SessionItem,
} from "@/db/schema/sessions";
import {
  decimalToCents,
  subtotalCents,
} from "@/domain/money/money";

export interface PublicSession {
  id: number;
  type: ServiceSessionType;
  status: ServiceSessionStatus;
  tableNumber: number | null;
  openedBy: number;
  closedBy: number | null;
  openedAt: Date;
  closedAt: Date | null;
  notes: string | null;
}

export interface PublicSessionItem {
  id: number;
  sessionId: number;
  productId: number;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
  status: "ACTIVE" | "REMOVED";
  addedBy: number;
  addedAt: Date;
  updatedAt: Date;
  removedBy: number | null;
  removedAt: Date | null;
}

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

// Public barrel for the sessions domain module (sessions and their items).
import type { Payment, PublicPayment } from "@/domain/payments";
import type {
  SessionItemStatus,
  SessionStatus,
  SessionType,
} from "./enums";

export interface ServiceSession {
  id: number;
  type: SessionType;
  status: SessionStatus;
  tableNumber: number | null;
  openedBy: number;
  closedBy: number | null;
  openedAt: Date;
  closedAt: Date | null;
  notes: string | null;
}

export type NewServiceSession = Pick<ServiceSession, "type" | "openedBy"> &
  Partial<
    Pick<
      ServiceSession,
      | "status"
      | "tableNumber"
      | "closedBy"
      | "openedAt"
      | "closedAt"
      | "notes"
    >
  >;

export interface SessionItem {
  id: number;
  sessionId: number;
  productId: number;
  quantity: string;
  unitPrice: string;
  status: SessionItemStatus;
  addedBy: number;
  addedAt: Date;
  updatedAt: Date;
  removedAt: Date | null;
  removedBy: number | null;
}

export type NewSessionItem = Pick<
  SessionItem,
  "sessionId" | "productId" | "unitPrice" | "addedBy"
> &
  Partial<
    Pick<
      SessionItem,
      | "quantity"
      | "status"
      | "addedAt"
      | "updatedAt"
      | "removedAt"
      | "removedBy"
    >
  >;

export type PublicSession = ServiceSession;

export type PublicSessionItem = Omit<SessionItem, "quantity" | "unitPrice"> & {
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
};

export type OpenSessionInput = Pick<ServiceSession, "type"> & {
  tableNumber?: number;
  notes?: string | null;
};

export interface AddSessionItemInput {
  productId: number;
  quantity: number;
}

export interface SessionDetail {
  session: PublicSession;
  items: PublicSessionItem[];
  payments: PublicPayment[];
  totals: SessionTotals;
}

export interface SessionTotals {
  itemsCents: number;
  paidCents: number;
  balanceCents: number;
}

export type PricedItem = Pick<
  SessionItem,
  "unitPrice" | "quantity" | "status"
>;

export type PaymentAmount = Pick<Payment, "amount">;

export * from "./enums";
export * from "./ISession.repository";
export * from "./ISessionItem.repository";
export * from "./session.presenter";
export * from "./rules";
export * from "./totals";

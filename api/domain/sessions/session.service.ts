import type { IPaymentRepository } from "@/domain/payments/repositories/payment.repository";
import type { IProductRepository } from "@/domain/products/repositories/product.repository";
import type { NewServiceSession } from "@/db/schema/sessions";
import {
  ConflictError,
  NotFoundError,
  isUniqueViolation,
} from "@/app/errors";
import type { TransactionManager } from "@/app/transaction";
import { centsToDecimal, decimalToCents } from "@/domain/money/money";
import { toPublicPayment, type PublicPayment } from "@/domain/payments/payment.presenter";
import {
  assertSessionCanBeCancelled,
  assertSessionOpen,
  assertSessionSettled,
  assertTableAssignment,
} from "./rules";
import {
  calculateSessionTotals,
  type SessionTotals,
} from "./totals";
import {
  toPublicSession,
  toPublicSessionItem,
  type PublicSession,
  type PublicSessionItem,
} from "./session.presenter";
import type { ISessionItemRepository } from "./repositories/session-item.repository";
import type { ISessionRepository } from "./repositories/session.repository";
import type {
  ServiceSessionStatus,
  ServiceSessionType,
} from "@/db/schema/sessions";

export const SESSION_TYPES = ["TABLE", "COUNTER"] as const;
export const SESSION_STATUSES = ["OPEN", "CLOSED", "CANCELLED"] as const;

export interface OpenSessionInput {
  type: ServiceSessionType;
  tableNumber?: number;
  notes?: string | null;
}

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

export class SessionService {
  constructor(
    private readonly sessions: ISessionRepository,
    private readonly items: ISessionItemRepository,
    private readonly products: IProductRepository,
    private readonly payments: IPaymentRepository,
    private readonly transactions: TransactionManager,
  ) {}

  async open(
    actorId: number,
    input: OpenSessionInput,
  ): Promise<PublicSession> {
    assertTableAssignment(input);

    const tableNumber =
      input.type === "TABLE" ? (input.tableNumber ?? null) : null;
    const values: NewServiceSession = {
      type: input.type,
      status: "OPEN",
      tableNumber,
      openedBy: actorId,
      notes: input.notes ?? null,
    };

    try {
      const session = await this.transactions.transaction(async (client) => {
        if (tableNumber !== null) {
          const openSession = await this.sessions.findOpenByTableNumber(
            tableNumber,
            client,
          );

          if (openSession) {
            throw new ConflictError(
              "TABLE_OCCUPIED",
              `Table ${tableNumber} already has an open session`,
            );
          }
        }

        return this.sessions.create(values, client);
      });

      return toPublicSession(session);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError(
          "TABLE_OCCUPIED",
          `Table ${tableNumber} already has an open session`,
        );
      }

      throw error;
    }
  }

  async list(status?: ServiceSessionStatus): Promise<PublicSession[]> {
    const sessions = await this.sessions.findByStatus(status);
    return sessions.map(toPublicSession);
  }

  async detail(id: number): Promise<SessionDetail> {
    const session = await this.sessions.findById(id);

    if (!session) {
      throw new NotFoundError("Session not found", "SESSION_NOT_FOUND");
    }

    const items = await this.items.findBySessionId(id);
    const payments = await this.payments.findBySessionId(id);

    return {
      session: toPublicSession(session),
      items: items.map(toPublicSessionItem),
      payments: payments.map(toPublicPayment),
      totals: calculateSessionTotals(items, payments),
    };
  }

  async close(id: number, actorId: number): Promise<PublicSession> {
    return this.transactions.transaction(async (client) => {
      const session = await this.sessions.findByIdForUpdate(id, client);

      if (!session) {
        throw new NotFoundError("Session not found", "SESSION_NOT_FOUND");
      }

      assertSessionOpen(session);

      const items = await this.items.findBySessionId(id, client);
      const payments = await this.payments.findBySessionId(id, client);
      const totals = calculateSessionTotals(items, payments);

      assertSessionSettled(totals);

      const closed = await this.sessions.close(id, actorId, client);

      if (!closed) {
        throw new ConflictError(
          "SESSION_NOT_OPEN",
          "Session could not be closed because it is no longer open",
        );
      }

      return toPublicSession(closed);
    });
  }

  async cancel(id: number, actorId: number): Promise<PublicSession> {
    return this.transactions.transaction(async (client) => {
      const session = await this.sessions.findByIdForUpdate(id, client);

      if (!session) {
        throw new NotFoundError("Session not found", "SESSION_NOT_FOUND");
      }

      assertSessionOpen(session);

      const payments = await this.payments.findBySessionId(id, client);
      assertSessionCanBeCancelled(payments.length);

      const cancelled = await this.sessions.cancel(id, actorId, client);

      if (!cancelled) {
        throw new ConflictError(
          "SESSION_NOT_OPEN",
          "Session could not be cancelled because it is no longer open",
        );
      }

      return toPublicSession(cancelled);
    });
  }

  async listItems(sessionId: number): Promise<PublicSessionItem[]> {
    await this.ensureSession(sessionId);
    const items = await this.items.findBySessionId(sessionId);
    return items.map(toPublicSessionItem);
  }

  async addItem(
    sessionId: number,
    actorId: number,
    input: AddSessionItemInput,
  ): Promise<PublicSessionItem> {
    return this.transactions.transaction(async (client) => {
      const session = await this.sessions.findByIdForUpdate(sessionId, client);

      if (!session) {
        throw new NotFoundError("Session not found", "SESSION_NOT_FOUND");
      }

      assertSessionOpen(session);

      const product = await this.products.findById(input.productId, client);

      if (!product) {
        throw new NotFoundError("Product not found", "PRODUCT_NOT_FOUND");
      }

      if (!product.active) {
        throw new ConflictError(
          "PRODUCT_INACTIVE",
          "Inactive products cannot be added to a session",
        );
      }

      const unitPriceCents = decimalToCents(product.price);

      const item = await this.items.add(
        {
          sessionId,
          productId: product.id,
          quantity: input.quantity.toFixed(3),
          unitPrice: centsToDecimal(unitPriceCents),
          status: "ACTIVE",
          addedBy: actorId,
        },
        client,
      );

      return toPublicSessionItem(item);
    });
  }

  async removeItem(
    sessionId: number,
    itemId: number,
    actorId: number,
  ): Promise<PublicSessionItem> {
    return this.transactions.transaction(async (client) => {
      const session = await this.sessions.findByIdForUpdate(sessionId, client);

      if (!session) {
        throw new NotFoundError("Session not found", "SESSION_NOT_FOUND");
      }

      assertSessionOpen(session);

      const item = await this.items.findById(itemId, client);

      if (!item || item.sessionId !== sessionId) {
        throw new NotFoundError(
          "Session item not found",
          "SESSION_ITEM_NOT_FOUND",
        );
      }

      if (item.status !== "ACTIVE") {
        throw new ConflictError(
          "ITEM_ALREADY_REMOVED",
          "Session item has already been removed",
        );
      }

      const removed = await this.items.removeForSession(
        sessionId,
        itemId,
        actorId,
        client,
      );

      if (!removed) {
        throw new ConflictError(
          "ITEM_ALREADY_REMOVED",
          "Session item has already been removed",
        );
      }

      return toPublicSessionItem(removed);
    });
  }

  private async ensureSession(id: number): Promise<void> {
    const session = await this.sessions.findById(id);

    if (!session) {
      throw new NotFoundError("Session not found", "SESSION_NOT_FOUND");
    }
  }
}

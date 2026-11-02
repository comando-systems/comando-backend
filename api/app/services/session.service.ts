// Service session use cases: opening, item changes, closing, and cancellation.
import { ConflictError, NotFoundError, isUniqueViolation } from "@/app/errors";
import type { TransactionManager } from "@/app/transaction";
import type { DbExecutor } from "@/db";
import { centsToDecimal, decimalToCents } from "@/domain/money";
import {
  toPublicPayment,
  type IPaymentRepository,
} from "@/domain/payments";
import { requireProduct, type IProductRepository } from "@/domain/products";
import {
  assertSessionCanBeCancelled,
  assertSessionOpen,
  assertSessionSettled,
  assertTableAssignment,
  calculateSessionTotals,
  requireSession,
  toPublicSession,
  toPublicSessionItem,
  type AddSessionItemInput,
  type ISessionItemRepository,
  type ISessionRepository,
  type NewServiceSession,
  type OpenSessionInput,
  type PublicSession,
  type PublicSessionItem,
  type ServiceSession,
  type SessionDetail,
} from "@/domain/sessions";

function requireSessionTransition(
  session: ServiceSession | undefined,
  action: "closed" | "cancelled",
): ServiceSession {
  if (!session) {
    throw new ConflictError(
      "SESSION_NOT_OPEN",
      `Session could not be ${action} because it is no longer open`,
    );
  }

  return session;
}

/** Coordinates sessions and their items while enforcing lifecycle invariants. */
export class SessionService {
  constructor(
    private readonly sessions: ISessionRepository,
    private readonly items: ISessionItemRepository,
    private readonly products: IProductRepository,
    private readonly payments: IPaymentRepository,
    private readonly transactions: TransactionManager,
  ) {}

  /** Opens a session, preventing two open sessions on the same table. */
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
          // Check inside the transaction; the DB unique index is the final guard.
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
      // A concurrent request may have occupied the table first.
      if (isUniqueViolation(error)) {
        throw new ConflictError(
          "TABLE_OCCUPIED",
          `Table ${tableNumber} already has an open session`,
        );
      }

      throw error;
    }
  }

  /** Lists sessions, optionally filtered by status. */
  async list(status?: PublicSession["status"]): Promise<PublicSession[]> {
    const sessions = await this.sessions.findByStatus(status);
    return sessions.map(toPublicSession);
  }

  /** Returns a session with its items, payments, and computed totals. */
  async detail(id: number): Promise<SessionDetail> {
    const session = requireSession(await this.sessions.findById(id));
    const items = await this.items.findBySessionId(id);
    const payments = await this.payments.findBySessionId(id);

    return {
      session: toPublicSession(session),
      items: items.map(toPublicSessionItem),
      payments: payments.map(toPublicPayment),
      totals: calculateSessionTotals(items, payments),
    };
  }

  /** Closes a fully settled session under a row lock. */
  async close(id: number, actorId: number): Promise<PublicSession> {
    return this.transactions.transaction(async (client) => {
      // Lock the row so close, payment, and cancellation cannot race.
      await this.lockOpenSession(id, client);

      const items = await this.items.findBySessionId(id, client);
      const payments = await this.payments.findBySessionId(id, client);
      const totals = calculateSessionTotals(items, payments);

      assertSessionSettled(totals);

      const closed = await this.sessions.close(id, actorId, client);

      // Guard against the status changing between the lock and the update.
      return toPublicSession(requireSessionTransition(closed, "closed"));
    });
  }

  /** Cancels an open session that has no recorded payments. */
  async cancel(id: number, actorId: number): Promise<PublicSession> {
    return this.transactions.transaction(async (client) => {
      // Lock the row so no payment is recorded while cancelling.
      await this.lockOpenSession(id, client);

      const payments = await this.payments.findBySessionId(id, client);
      assertSessionCanBeCancelled(payments.length);

      const cancelled = await this.sessions.cancel(id, actorId, client);

      // Guard against the status changing between the lock and the update.
      return toPublicSession(requireSessionTransition(cancelled, "cancelled"));
    });
  }

  /** Lists the items of an existing session. */
  async listItems(sessionId: number): Promise<PublicSessionItem[]> {
    requireSession(await this.sessions.findById(sessionId));
    const items = await this.items.findBySessionId(sessionId);
    return items.map(toPublicSessionItem);
  }

  /** Adds an item to an open session, snapshotting the product price. */
  async addItem(
    sessionId: number,
    actorId: number,
    input: AddSessionItemInput,
  ): Promise<PublicSessionItem> {
    return this.transactions.transaction(async (client) => {
      // Lock the session so items cannot be added after it starts closing.
      await this.lockOpenSession(sessionId, client);

      const product = requireProduct(
        await this.products.findById(input.productId, client),
      );

      if (!product.active) {
        throw new ConflictError(
          "PRODUCT_INACTIVE",
          "Inactive products cannot be added to a session",
        );
      }

      // Snapshot the current price so later product changes do not alter history.
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

  /** Marks an item as removed while retaining the row for auditing. */
  async removeItem(
    sessionId: number,
    itemId: number,
    actorId: number,
  ): Promise<PublicSessionItem> {
    return this.transactions.transaction(async (client) => {
      // Lock the session to serialize removals with close and add-item calls.
      await this.lockOpenSession(sessionId, client);

      const item = await this.items.findById(itemId, client);

      if (!item || item.sessionId !== sessionId) {
        throw new NotFoundError(
          "Session item not found",
          "SESSION_ITEM_NOT_FOUND",
        );
      }

      const removed = await this.items.removeForSession(
        sessionId,
        itemId,
        actorId,
        client,
      );

      // A conditional update may lose a race with another removal.
      if (!removed) {
        throw new ConflictError(
          "ITEM_ALREADY_REMOVED",
          "Session item has already been removed",
        );
      }

      return toPublicSessionItem(removed);
    });
  }

  /** Locks an existing open session before mutating its state. */
  private async lockOpenSession(
    id: number,
    client: DbExecutor | undefined,
  ): Promise<ServiceSession> {
    const session = requireSession(
      await this.sessions.findByIdForUpdate(id, client),
    );
    assertSessionOpen(session);
    return session;
  }
}

// Payment use cases: listing and recording payments against an open session.
import type { TransactionManager } from "@/app/transaction";
import { centsToDecimal } from "@/domain/money";
import {
  assertPaymentAllowed,
  toPublicPayment,
  type CreatePaymentInput,
  type IPaymentRepository,
  type PublicPayment,
} from "@/domain/payments";
import {
  assertSessionOpen,
  calculateSessionTotals,
  requireSession,
  type ISessionItemRepository,
  type ISessionRepository,
} from "@/domain/sessions";

/** Records payments while enforcing session and balance invariants. */
export class PaymentService {
  constructor(
    private readonly sessions: ISessionRepository,
    private readonly items: ISessionItemRepository,
    private readonly payments: IPaymentRepository,
    private readonly transactions: TransactionManager,
  ) {}

  /** Lists payments for an existing session. */
  async listBySession(sessionId: number): Promise<PublicPayment[]> {
    requireSession(await this.sessions.findById(sessionId));

    const payments = await this.payments.findBySessionId(sessionId);
    return payments.map(toPublicPayment);
  }

  /** Records a payment after locking the session and rechecking its balance. */
  async create(
    sessionId: number,
    actorId: number,
    input: CreatePaymentInput,
  ): Promise<PublicPayment> {
    return this.transactions.transaction(async (client) => {
      // Lock the session row so concurrent payments cannot overpay it.
      const session = requireSession(
        await this.sessions.findByIdForUpdate(sessionId, client),
      );
      assertSessionOpen(session);

      const items = await this.items.findBySessionId(sessionId, client);
      const existingPayments = await this.payments.findBySessionId(
        sessionId,
        client,
      );
      const totals = calculateSessionTotals(items, existingPayments);

      // Reject overpayment, empty sessions, and already-settled sessions.
      assertPaymentAllowed(totals, input.amountCents);

      const payment = await this.payments.create(
        {
          sessionId,
          amount: centsToDecimal(input.amountCents),
          method: input.method,
          receivedBy: actorId,
          notes: input.notes ?? null,
        },
        client,
      );

      return toPublicPayment(payment);
    });
  }
}

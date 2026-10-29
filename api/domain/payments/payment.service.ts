import type { PaymentMethod } from "@/db/schema/payments";
import { NotFoundError } from "@/app/errors";
import type { TransactionManager } from "@/app/transaction";
import { centsToDecimal } from "@/domain/money/money";
import { calculateSessionTotals } from "@/domain/sessions/totals";
import { assertSessionOpen } from "@/domain/sessions/rules";
import type { ISessionItemRepository } from "@/domain/sessions/repositories/session-item.repository";
import type { ISessionRepository } from "@/domain/sessions/repositories/session.repository";
import type { IPaymentRepository } from "./repositories/payment.repository";
import { toPublicPayment, type PublicPayment } from "./payment.presenter";
import { assertPaymentAllowed } from "./rules";

export interface CreatePaymentInput {
  amountCents: number;
  method: PaymentMethod;
  notes?: string | null;
}

export class PaymentService {
  constructor(
    private readonly sessions: ISessionRepository,
    private readonly items: ISessionItemRepository,
    private readonly payments: IPaymentRepository,
    private readonly transactions: TransactionManager,
  ) {}

  async listBySession(sessionId: number): Promise<PublicPayment[]> {
    const session = await this.sessions.findById(sessionId);

    if (!session) {
      throw new NotFoundError("Session not found", "SESSION_NOT_FOUND");
    }

    const payments = await this.payments.findBySessionId(sessionId);
    return payments.map(toPublicPayment);
  }

  async create(
    sessionId: number,
    actorId: number,
    input: CreatePaymentInput,
  ): Promise<PublicPayment> {
    return this.transactions.transaction(async (client) => {
      const session = await this.sessions.findByIdForUpdate(sessionId, client);

      if (!session) {
        throw new NotFoundError("Session not found", "SESSION_NOT_FOUND");
      }

      assertSessionOpen(session);

      const items = await this.items.findBySessionId(sessionId, client);
      const existingPayments = await this.payments.findBySessionId(
        sessionId,
        client,
      );
      const totals = calculateSessionTotals(items, existingPayments);

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

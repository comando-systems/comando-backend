import { recordAudit } from '@/app/audit';
import { requireActor } from '@/app/authorization';
import type { Clock } from '@/app/ports/clock';
import type { UnitOfWork } from '@/app/ports/unit-of-work';
import { findOrderForUpdate } from '@/app/use-cases/orders/load-order';
import type { Order, OrderPaymentInput } from '@/domain/entity/order';
import type { Repositories } from '@/domain/repository';
import type { OrderID, UserID } from '@/domain/value-objects/ids';

export interface CloseOrderInput {
  readonly actorUserId: UserID;
  readonly orderId: OrderID;
  readonly payments: readonly OrderPaymentInput[];
  readonly requestId?: string;
}

export class CloseOrderUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWork<Repositories>,
    private readonly clock: Clock,
  ) {}

  async execute(input: CloseOrderInput): Promise<Order> {
    return this.unitOfWork.run(async (repositories) => {
      const actor = await requireActor(repositories, input.actorUserId, 'orders:close');
      const order = await findOrderForUpdate(repositories, input.orderId);
      const now = this.clock.now();

      order.close(actor.id, input.payments, now);

      await repositories.orders.save(order);
      await recordAudit(repositories, {
        actorUserId: actor.id,
        action: 'order.close',
        targetType: 'ORDER',
        targetId: order.id.value,
        requestId: input.requestId,
        metadata: {
          totalCents: order.total.cents,
          payments: order.payments.length,
        },
        now,
      });

      return order;
    });
  }
}

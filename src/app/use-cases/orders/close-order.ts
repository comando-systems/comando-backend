import { recordAudit } from '@/app/audit';
import { requireActor } from '@/app/authorization';
import type { Clock } from '@/app/ports/clock';
import type { UnitOfWork } from '@/app/ports/unit-of-work';
import { findOrderForUpdate } from '@/app/use-cases/orders/load-order';
import type { Order, OrderPaymentInput } from '@/domain/entity/order';
import type { Repositories } from '@/domain/repository';
import type { OrderID, UserID } from '@/domain/value-objects/ids';

export interface CloseOrderInput {
  readonly requestId?: string;
  readonly actorUserId: UserID;
  readonly orderId: OrderID;
  readonly payments: readonly OrderPaymentInput[];
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

      order.close(actor.id, input.payments, this.clock.now());

      await repositories.orders.save(order);
      await recordAudit(
        repositories,
        input,
        'order.close',
        { type: 'order', id: order.id.value },
        { totalCents: order.pricing.total.cents },
      );
      return order;
    });
  }
}

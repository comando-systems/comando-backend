import { recordAudit } from '@/app/audit';
import { requireActor } from '@/app/authorization';
import type { Clock } from '@/app/ports/clock';
import type { UnitOfWork } from '@/app/ports/unit-of-work';
import { findOrderForUpdate } from '@/app/use-cases/orders/load-order';
import type { Order } from '@/domain/entity/order';
import type { Repositories } from '@/domain/repository';
import type { OrderID, UserID } from '@/domain/value-objects/ids';

export interface CancelOrderInput {
  readonly requestId?: string;
  readonly actorUserId: UserID;
  readonly orderId: OrderID;
}

export class CancelOrderUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWork<Repositories>,
    private readonly clock: Clock,
  ) {}

  async execute(input: CancelOrderInput): Promise<Order> {
    return this.unitOfWork.run(async (repositories) => {
      const actor = await requireActor(repositories, input.actorUserId, 'orders:cancel');
      const order = await findOrderForUpdate(repositories, input.orderId);

      order.cancel(actor.id, this.clock.now());

      await repositories.orders.save(order);
      await recordAudit(repositories, input, 'order.cancel', { type: 'order', id: order.id.value });
      return order;
    });
  }
}

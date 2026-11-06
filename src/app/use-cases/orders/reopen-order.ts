import { recordAudit } from '@/app/audit';
import { requireActor } from '@/app/authorization';
import type { Clock } from '@/app/ports/clock';
import type { UnitOfWork } from '@/app/ports/unit-of-work';
import { findTableOrderForUpdate } from '@/app/use-cases/orders/load-order';
import type { Order } from '@/domain/entity/order';
import type { Repositories } from '@/domain/repository';
import type { OrderID, UserID } from '@/domain/value-objects/ids';

export interface ReopenOrderInput {
  readonly requestId?: string;
  readonly actorUserId: UserID;
  readonly orderId: OrderID;
}

export class ReopenOrderUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWork<Repositories>,
    private readonly clock: Clock,
  ) {}

  async execute(input: ReopenOrderInput): Promise<Order> {
    return this.unitOfWork.run(async (repositories) => {
      await requireActor(repositories, input.actorUserId, 'orders:request-payment');
      const order = await findTableOrderForUpdate(repositories, input.orderId);

      order.reopen(this.clock.now());

      await repositories.orders.save(order);
      await recordAudit(repositories, input, 'order.reopen', { type: 'order', id: order.id.value });
      return order;
    });
  }
}

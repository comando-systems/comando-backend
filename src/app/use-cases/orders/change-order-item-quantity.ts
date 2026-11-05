import { recordAudit } from '@/app/audit';
import { requireActor } from '@/app/authorization';
import type { Clock } from '@/app/ports/clock';
import type { UnitOfWork } from '@/app/ports/unit-of-work';
import { findTableOrderForUpdate } from '@/app/use-cases/orders/load-order';
import type { Order } from '@/domain/entity/order';
import type { Repositories } from '@/domain/repository';
import type { ItemID, OrderID, UserID } from '@/domain/value-objects/ids';

export interface ChangeOrderItemQuantityInput {
  readonly actorUserId: UserID;
  readonly orderId: OrderID;
  readonly itemId: ItemID;
  readonly quantity: number;
  readonly requestId?: string;
}

export class ChangeOrderItemQuantityUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWork<Repositories>,
    private readonly clock: Clock,
  ) {}

  async execute(input: ChangeOrderItemQuantityInput): Promise<Order> {
    return this.unitOfWork.run(async (repositories) => {
      const actor = await requireActor(repositories, input.actorUserId, 'orders:update');

      const order = await findTableOrderForUpdate(repositories, input.orderId);
      const now = this.clock.now();
      order.changeItemQuantity(input.itemId, input.quantity, now);

      await repositories.orders.save(order);
      await recordAudit(repositories, {
        actorUserId: actor.id,
        action: 'order.item.quantity.change',
        targetType: 'ORDER',
        targetId: order.id.value,
        requestId: input.requestId,
        metadata: {
          itemId: input.itemId.value,
          quantity: input.quantity,
          totalCents: order.total.cents,
        },
        now,
      });

      return order;
    });
  }
}

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
}

export class ChangeOrderItemQuantityUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWork<Repositories>,
    private readonly clock: Clock,
  ) {}

  async execute(input: ChangeOrderItemQuantityInput): Promise<Order> {
    return this.unitOfWork.run(async (repositories) => {
      await requireActor(repositories, input.actorUserId, 'orders:update');

      const order = await findTableOrderForUpdate(repositories, input.orderId);
      order.changeItemQuantity(input.itemId, input.quantity, this.clock.now());

      await repositories.orders.save(order);
      return order;
    });
  }
}

import { requireActor } from '@/app/authorization';
import { ForbiddenError, NotFoundError } from '@/app/errors';
import type { UnitOfWork } from '@/app/ports/unit-of-work';
import { isLiveStatus, LIVE_VIEW_PERMISSIONS } from '@/app/use-cases/orders/live-orders';
import type { Order } from '@/domain/entity/order';
import type { Repositories } from '@/domain/repository';
import type { OrderID, UserID } from '@/domain/value-objects/ids';

export interface GetOrderInput {
  readonly actorUserId: UserID;
  readonly orderId: OrderID;
}

export class GetOrderUseCase {
  constructor(private readonly unitOfWork: UnitOfWork<Repositories>) {}

  async execute(input: GetOrderInput): Promise<Order> {
    return this.unitOfWork.read(async (repositories) => {
      const actor = await requireActor(repositories, input.actorUserId);

      // Without the history permission the actor may only follow orders that are still live.
      if (
        !actor.hasPermission('orders:history') &&
        !LIVE_VIEW_PERMISSIONS.some((permission) => actor.hasPermission(permission))
      ) {
        throw new ForbiddenError();
      }

      const order = await repositories.orders.findById(input.orderId);

      if (order === null) {
        throw new NotFoundError('Order not found');
      }

      if (!actor.hasPermission('orders:history') && !isLiveStatus(order.status)) {
        throw new ForbiddenError();
      }

      return order;
    });
  }
}

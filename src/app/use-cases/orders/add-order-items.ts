import { requireActor } from '@/app/authorization';
import { ValidationError } from '@/app/errors';
import type { Clock } from '@/app/ports/clock';
import type { UnitOfWork } from '@/app/ports/unit-of-work';
import {
  type OrderLineInput,
  resolveActiveOrderLines,
} from '@/app/use-cases/orders/active-order-lines';
import { findTableOrderForUpdate } from '@/app/use-cases/orders/load-order';
import type { Order } from '@/domain/entity/order';
import type { Repositories } from '@/domain/repository';
import type { OrderID, UserID } from '@/domain/value-objects/ids';

export interface AddOrderItemsInput {
  readonly actorUserId: UserID;
  readonly orderId: OrderID;
  readonly lines: readonly OrderLineInput[];
}

export class AddOrderItemsUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWork<Repositories>,
    private readonly clock: Clock,
  ) {}

  async execute(input: AddOrderItemsInput): Promise<Order> {
    if (input.lines.length === 0) {
      throw new ValidationError('At least one item is required');
    }

    return this.unitOfWork.run(async (repositories) => {
      await requireActor(repositories, input.actorUserId, 'orders:update');

      const order = await findTableOrderForUpdate(repositories, input.orderId);
      const lines = await resolveActiveOrderLines(repositories, input.lines);
      const now = this.clock.now();

      for (const line of lines) {
        order.addItem(line.item, line.quantity, now);
      }

      await repositories.orders.save(order);
      return order;
    });
  }
}

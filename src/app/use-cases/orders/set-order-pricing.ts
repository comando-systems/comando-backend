import { recordAudit } from '@/app/audit';
import { requireActorAny } from '@/app/authorization';
import { ValidationError } from '@/app/errors';
import type { Clock } from '@/app/ports/clock';
import type { UnitOfWork } from '@/app/ports/unit-of-work';
import { findTableOrderForUpdate } from '@/app/use-cases/orders/load-order';
import type { Adjustment, Order } from '@/domain/entity/order';
import type { Repositories } from '@/domain/repository';
import type { OrderID, UserID } from '@/domain/value-objects/ids';

export interface SetOrderPricingInput {
  readonly requestId?: string;
  readonly actorUserId: UserID;
  readonly orderId: OrderID;
  // `null` clears the adjustment; omitted leaves it as it is.
  readonly adjustment?: Adjustment | null;
  readonly applyServiceFee?: boolean;
}

// The server taking the order and the cashier closing the bill may both adjust the price.
export class SetOrderPricingUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWork<Repositories>,
    private readonly clock: Clock,
  ) {}

  async execute(input: SetOrderPricingInput): Promise<Order> {
    if (input.adjustment === undefined && input.applyServiceFee === undefined) {
      throw new ValidationError('Provide an adjustment or applyServiceFee');
    }

    return this.unitOfWork.run(async (repositories) => {
      await requireActorAny(repositories, input.actorUserId, ['orders:update', 'orders:close']);
      const order = await findTableOrderForUpdate(repositories, input.orderId);
      const now = this.clock.now();

      if (input.adjustment !== undefined) {
        order.setAdjustment(input.adjustment, now);
      }

      if (input.applyServiceFee !== undefined) {
        const settings = await repositories.settings.get();
        order.setServiceFee(input.applyServiceFee, settings.effectiveServiceFeeBasisPoints, now);
      }

      await repositories.orders.save(order);
      await recordAudit(
        repositories,
        input,
        'order.pricing.set',
        { type: 'order', id: order.id.value },
        { totalCents: order.pricing.total.cents },
      );
      return order;
    });
  }
}

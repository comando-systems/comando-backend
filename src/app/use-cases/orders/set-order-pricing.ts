import { recordAudit } from '@/app/audit';
import { requireActorAny } from '@/app/authorization';
import { ValidationError } from '@/app/errors';
import type { Clock } from '@/app/ports/clock';
import type { UnitOfWork } from '@/app/ports/unit-of-work';
import { findTableOrderForUpdate } from '@/app/use-cases/orders/load-order';
import type { Order } from '@/domain/entity/order';
import type { Repositories } from '@/domain/repository';
import type { OrderID, UserID } from '@/domain/value-objects/ids';
import { Money } from '@/domain/value-objects/money';

export interface SetOrderPricingInput {
  readonly requestId?: string;
  readonly actorUserId: UserID;
  readonly orderId: OrderID;
  // `null` clears the amount to zero; omitted leaves it as it is.
  readonly surchargeCents?: number | null;
  readonly discountCents?: number | null;
  readonly applyServiceFee?: boolean;
}

// The server taking the order and the cashier closing the bill may both adjust the price.
export class SetOrderPricingUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWork<Repositories>,
    private readonly clock: Clock,
  ) {}

  async execute(input: SetOrderPricingInput): Promise<Order> {
    if (
      input.surchargeCents === undefined &&
      input.discountCents === undefined &&
      input.applyServiceFee === undefined
    ) {
      throw new ValidationError('Provide a surcharge, a discount, or applyServiceFee');
    }

    return this.unitOfWork.run(async (repositories) => {
      await requireActorAny(repositories, input.actorUserId, ['orders:update', 'orders:close']);
      const order = await findTableOrderForUpdate(repositories, input.orderId);
      const now = this.clock.now();

      if (input.surchargeCents !== undefined || input.discountCents !== undefined) {
        const surcharge =
          input.surchargeCents === undefined
            ? order.surcharge
            : Money.fromCents(input.surchargeCents ?? 0);
        const discount =
          input.discountCents === undefined
            ? order.discount
            : Money.fromCents(input.discountCents ?? 0);

        order.setAmounts(surcharge, discount, now);
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

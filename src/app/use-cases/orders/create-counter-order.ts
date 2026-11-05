import { recordAudit } from '@/app/audit';
import { requireActor } from '@/app/authorization';
import type { Clock } from '@/app/ports/clock';
import type { IdGenerator } from '@/app/ports/id-generator';
import type { UnitOfWork } from '@/app/ports/unit-of-work';
import {
  type OrderLineInput,
  resolveActiveOrderLines,
} from '@/app/use-cases/orders/active-order-lines';
import { Order, type OrderPaymentInput } from '@/domain/entity/order';
import type { Repositories } from '@/domain/repository';
import { OrderID, type UserID } from '@/domain/value-objects/ids';

export interface CreateCounterOrderInput {
  readonly actorUserId: UserID;
  readonly lines: readonly OrderLineInput[];
  readonly payments: readonly OrderPaymentInput[];
  readonly requestId?: string;
}

export class CreateCounterOrderUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWork<Repositories>,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: CreateCounterOrderInput): Promise<Order> {
    return this.unitOfWork.run(async (repositories) => {
      const actor = await requireActor(repositories, input.actorUserId, 'orders:counter');

      const lines = await resolveActiveOrderLines(repositories, input.lines);
      const now = this.clock.now();
      const order = Order.createCounter({
        id: new OrderID(await this.ids.next()),
        openedByUserId: input.actorUserId,
        lines,
        payments: input.payments,
        now,
      });

      await repositories.orders.create(order);
      await recordAudit(repositories, {
        actorUserId: actor.id,
        action: 'order.counter.create',
        targetType: 'ORDER',
        targetId: order.id.value,
        requestId: input.requestId,
        metadata: {
          totalCents: order.total.cents,
          itemLines: order.items.length,
          payments: order.payments.length,
        },
        now,
      });

      return order;
    });
  }
}

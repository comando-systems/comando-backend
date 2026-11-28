import { recordAudit } from '@/app/audit';
import { requireActor } from '@/app/authorization';
import type { Clock } from '@/app/ports/clock';
import type { IdGenerator } from '@/app/ports/id-generator';
import type { UnitOfWork } from '@/app/ports/unit-of-work';
import { Order } from '@/domain/entity/order';
import type { Repositories } from '@/domain/repository';
import { OrderID, type UserID } from '@/domain/value-objects/ids';

export interface OpenTableOrderInput {
  readonly requestId?: string;
  readonly actorUserId: UserID;
  readonly tableCode?: string | null;
}

export class OpenTableOrderUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWork<Repositories>,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: OpenTableOrderInput): Promise<Order> {
    return this.unitOfWork.run(async (repositories) => {
      await requireActor(repositories, input.actorUserId, 'orders:open');

      // Opening is not occupancy: a named table is only taken once it has lines.
      const settings = await repositories.settings.get();

      const order = Order.openTable({
        id: new OrderID(await this.ids.next()),
        openedByUserId: input.actorUserId,
        tableCode: input.tableCode ?? null,
        serviceFeeBasisPoints: settings.effectiveServiceFeeBasisPoints,
        now: this.clock.now(),
      });

      await repositories.orders.create(order);
      await recordAudit(
        repositories,
        input,
        'order.table.open',
        { type: 'order', id: order.id.value },
        { tableCode: order.originalTableCode },
      );
      return order;
    });
  }
}

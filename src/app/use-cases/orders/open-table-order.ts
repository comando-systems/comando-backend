import { recordAudit } from '@/app/audit';
import { requireActor } from '@/app/authorization';
import { ConflictError } from '@/app/errors';
import type { Clock } from '@/app/ports/clock';
import type { IdGenerator } from '@/app/ports/id-generator';
import type { UnitOfWork } from '@/app/ports/unit-of-work';
import { Order } from '@/domain/entity/order';
import { requireNonEmptyString } from '@/domain/entity/validation';
import type { Repositories } from '@/domain/repository';
import { OrderID, type UserID } from '@/domain/value-objects/ids';

export interface OpenTableOrderInput {
  readonly actorUserId: UserID;
  readonly tableCode: string;
  readonly requestId?: string;
}

export class OpenTableOrderUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWork<Repositories>,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: OpenTableOrderInput): Promise<Order> {
    const tableCode = requireNonEmptyString(input.tableCode, 'Table code', 64);

    return this.unitOfWork.run(async (repositories) => {
      const actor = await requireActor(repositories, input.actorUserId, 'orders:open');

      const openOrder = await repositories.orders.findOpenTableByCode(tableCode);

      if (openOrder !== null) {
        throw new ConflictError('Table already has an open order');
      }

      const now = this.clock.now();
      const order = Order.openTable({
        id: new OrderID(await this.ids.next()),
        openedByUserId: input.actorUserId,
        tableCode,
        now,
      });

      await repositories.orders.create(order);
      await recordAudit(repositories, {
        actorUserId: actor.id,
        action: 'order.table.open',
        targetType: 'ORDER',
        targetId: order.id.value,
        requestId: input.requestId,
        metadata: { tableCode: order.tableCode },
        now,
      });

      return order;
    });
  }
}

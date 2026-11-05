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
      await requireActor(repositories, input.actorUserId, 'orders:open');

      const openOrder = await repositories.orders.findActiveTableByCode(tableCode);

      if (openOrder !== null) {
        throw new ConflictError('Table already has an open order');
      }

      const order = Order.openTable({
        id: new OrderID(await this.ids.next()),
        openedByUserId: input.actorUserId,
        tableCode,
        now: this.clock.now(),
      });

      await repositories.orders.create(order);
      return order;
    });
  }
}

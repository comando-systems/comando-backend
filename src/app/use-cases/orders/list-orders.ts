import { requireActor, requireActorAny } from '@/app/authorization';
import { ValidationError } from '@/app/errors';
import type { UnitOfWork } from '@/app/ports/unit-of-work';
import { isLiveStatus, LIVE_VIEW_PERMISSIONS } from '@/app/use-cases/orders/live-orders';
import { requireOptionalDate, requirePage, requirePageSize } from '@/app/validation';
import {
  ORDER_STATUSES,
  ORDER_TYPES,
  type Order,
  type OrderStatus,
  type OrderType,
} from '@/domain/entity/order';
import type { Repositories } from '@/domain/repository';
import type { UserID } from '@/domain/value-objects/ids';

export interface ListOrdersInput {
  readonly actorUserId: UserID;
  readonly status?: OrderStatus;
  readonly statuses?: readonly OrderStatus[];
  readonly type?: OrderType;
  readonly tableCode?: string;
  readonly from?: Date;
  readonly to?: Date;
  readonly page: number;
  readonly pageSize: number;
}

export interface ListOrdersResult {
  readonly orders: readonly Order[];
  readonly total: number;
}

export class ListOrdersUseCase {
  constructor(private readonly unitOfWork: UnitOfWork<Repositories>) {}

  async execute(input: ListOrdersInput): Promise<ListOrdersResult> {
    const page = requirePage(input.page);
    const pageSize = requirePageSize(input.pageSize);

    if (input.status !== undefined && !ORDER_STATUSES.includes(input.status)) {
      throw new ValidationError('Invalid order status');
    }

    if (input.type !== undefined && !ORDER_TYPES.includes(input.type)) {
      throw new ValidationError('Invalid order type');
    }

    for (const status of input.statuses ?? []) {
      if (!ORDER_STATUSES.includes(status)) {
        throw new ValidationError('Invalid order status');
      }
    }

    // Open and awaiting-payment orders are working data, so anyone serving customers may list them.
    // Anything that can include a closed or canceled order is history.
    const requested =
      input.status === undefined ? input.statuses : [input.status, ...(input.statuses ?? [])];
    const liveOnly =
      requested !== undefined && requested.length > 0 && requested.every(isLiveStatus);

    const from = requireOptionalDate(input.from, 'From');
    const to = requireOptionalDate(input.to, 'To');

    if (from !== undefined && to !== undefined && from > to) {
      throw new ValidationError('From must be before To');
    }

    return this.unitOfWork.read(async (repositories) => {
      if (liveOnly) {
        await requireActorAny(repositories, input.actorUserId, LIVE_VIEW_PERMISSIONS);
      } else {
        await requireActor(repositories, input.actorUserId, 'orders:history');
      }

      return repositories.orders.list({
        status: input.status,
        statuses: input.statuses,
        type: input.type,
        tableCode: input.tableCode,
        from,
        to,
        page,
        pageSize,
      });
    });
  }
}

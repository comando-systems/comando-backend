import { requireActor } from '@/app/authorization';
import { ValidationError } from '@/app/errors';
import type { Clock } from '@/app/ports/clock';
import type { UnitOfWork } from '@/app/ports/unit-of-work';
import { requireOptionalDate } from '@/app/validation';
import type { Repositories } from '@/domain/repository';
import type { SalesSummary } from '@/domain/repository/report-repository';
import type { UserID } from '@/domain/value-objects/ids';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 366;

export interface GetSalesSummaryInput {
  readonly actorUserId: UserID;
  // Inclusive. The client sends its own day boundaries, so "today" follows the shop's time zone.
  readonly from?: Date;
  // Exclusive.
  readonly to?: Date;
}

export interface SalesSummaryResult extends SalesSummary {
  readonly from: Date;
  readonly to: Date;
  // Zero when no order was closed.
  readonly averageTicketCents: number;
}

function startOfUtcDay(instant: Date): Date {
  return new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate()));
}

export class GetSalesSummaryUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWork<Repositories>,
    private readonly clock: Clock,
  ) {}

  async execute(input: GetSalesSummaryInput): Promise<SalesSummaryResult> {
    const requestedFrom = requireOptionalDate(input.from, 'From');
    const requestedTo = requireOptionalDate(input.to, 'To');

    // One day by default: today in UTC, or the day that ends or starts at the date given.
    const from =
      requestedFrom ??
      (requestedTo === undefined
        ? startOfUtcDay(this.clock.now())
        : new Date(requestedTo.getTime() - DAY_MS));
    const to = requestedTo ?? new Date(from.getTime() + DAY_MS);

    if (from >= to) {
      throw new ValidationError('From must be before To');
    }

    if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) {
      throw new ValidationError(`The range cannot exceed ${MAX_RANGE_DAYS} days`);
    }

    return this.unitOfWork.read(async (repositories) => {
      await requireActor(repositories, input.actorUserId, 'reports:view');

      const summary = await repositories.reports.salesSummary({ from, to });

      return {
        ...summary,
        from,
        to,
        averageTicketCents:
          summary.closedOrders === 0 ? 0 : Math.round(summary.revenueCents / summary.closedOrders),
      };
    });
  }
}

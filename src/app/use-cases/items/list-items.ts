import { requireActor } from '@/app/authorization';
import type { UnitOfWork } from '@/app/ports/unit-of-work';
import { requirePage, requirePageSize } from '@/app/validation';
import type { Item } from '@/domain/entity/item';
import type { Repositories } from '@/domain/repository';
import type { UserID } from '@/domain/value-objects/ids';

export interface ListItemsInput {
  readonly actorUserId: UserID;
  readonly page: number;
  readonly pageSize: number;
  readonly includeRemoved?: boolean;
}

export interface ListItemsResult {
  readonly items: readonly Item[];
  readonly total: number;
}

export class ListItemsUseCase {
  constructor(private readonly unitOfWork: UnitOfWork<Repositories>) {}

  async execute(input: ListItemsInput): Promise<ListItemsResult> {
    const page = requirePage(input.page);
    const pageSize = requirePageSize(input.pageSize);

    return this.unitOfWork.read(async (repositories) => {
      const actor = await requireActor(repositories, input.actorUserId);

      return repositories.items.list({
        page,
        pageSize,
        includeRemoved: input.includeRemoved === true && actor.hasPermission('items:manage'),
      });
    });
  }
}

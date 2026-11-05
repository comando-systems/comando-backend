import { requireActor } from '@/app/authorization';
import { NotFoundError } from '@/app/errors';
import type { UnitOfWork } from '@/app/ports/unit-of-work';
import type { Item } from '@/domain/entity/item';
import type { Repositories } from '@/domain/repository';
import type { ItemID, UserID } from '@/domain/value-objects/ids';

export interface GetItemInput {
  readonly actorUserId: UserID;
  readonly itemId: ItemID;
}

export class GetItemUseCase {
  constructor(private readonly unitOfWork: UnitOfWork<Repositories>) {}

  async execute(input: GetItemInput): Promise<Item> {
    return this.unitOfWork.read(async (repositories) => {
      const actor = await requireActor(repositories, input.actorUserId);
      const item = await repositories.items.findById(input.itemId);

      if (item === null || (!item.isActive && !actor.hasPermission('items:manage'))) {
        throw new NotFoundError('Item not found');
      }

      return item;
    });
  }
}

import { requireActor } from '@/app/authorization';
import { ConflictError, NotFoundError } from '@/app/errors';
import type { Clock } from '@/app/ports/clock';
import type { UnitOfWork } from '@/app/ports/unit-of-work';
import type { Item } from '@/domain/entity/item';
import type { Repositories } from '@/domain/repository';
import type { ItemID, UserID } from '@/domain/value-objects/ids';

export interface RemoveItemInput {
  readonly actorUserId: UserID;
  readonly itemId: ItemID;
}

export class RemoveItemUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWork<Repositories>,
    private readonly clock: Clock,
  ) {}

  async execute(input: RemoveItemInput): Promise<Item> {
    return this.unitOfWork.run(async (repositories) => {
      await requireActor(repositories, input.actorUserId, 'items:manage');

      const item = await repositories.items.findById(input.itemId);

      if (item === null) {
        throw new NotFoundError('Item not found');
      }

      if (!item.isActive) {
        throw new ConflictError('Item is already removed');
      }

      item.remove(this.clock.now());
      await repositories.items.update(item);
      return item;
    });
  }
}

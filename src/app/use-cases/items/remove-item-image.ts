import { recordAudit } from '@/app/audit';
import { requireActor } from '@/app/authorization';
import { ConflictError, NotFoundError, ServiceUnavailableError } from '@/app/errors';
import type { Clock } from '@/app/ports/clock';
import type { ImageStorage } from '@/app/ports/image-storage';
import type { UnitOfWork } from '@/app/ports/unit-of-work';
import type { Item } from '@/domain/entity/item';
import type { Repositories } from '@/domain/repository';
import type { ItemID, UserID } from '@/domain/value-objects/ids';

export interface RemoveItemImageInput {
  readonly requestId?: string;
  readonly actorUserId: UserID;
  readonly itemId: ItemID;
}

export class RemoveItemImageUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWork<Repositories>,
    private readonly storage: ImageStorage | null,
    private readonly clock: Clock,
  ) {}

  async execute(input: RemoveItemImageInput): Promise<Item> {
    if (this.storage === null) {
      throw new ServiceUnavailableError('Image storage is not configured');
    }

    const storage = this.storage;

    return this.unitOfWork.run(async (repositories) => {
      await requireActor(repositories, input.actorUserId, 'items:manage');

      const item = await repositories.items.findById(input.itemId);

      if (item === null) {
        throw new NotFoundError('Item not found');
      }

      if (!item.isActive) {
        throw new ConflictError('Removed items cannot be edited');
      }

      const filename = storage.filenameFromUrl(item.imageUrl ?? '');

      item.update({ imageUrl: null, now: this.clock.now() });
      await repositories.items.update(item);
      await recordAudit(repositories, input, 'item.image.remove', {
        type: 'item',
        id: item.id.value,
      });

      if (filename !== null) {
        await storage.remove(filename);
      }

      return item;
    });
  }
}

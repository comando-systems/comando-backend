import { recordAudit } from '@/app/audit';
import { requireActor } from '@/app/authorization';
import { ConflictError, NotFoundError, ServiceUnavailableError } from '@/app/errors';
import type { Clock } from '@/app/ports/clock';
import type { ImageStorage, SupportedImageContentType } from '@/app/ports/image-storage';
import type { UnitOfWork } from '@/app/ports/unit-of-work';
import type { Item } from '@/domain/entity/item';
import type { Repositories } from '@/domain/repository';
import type { ItemID, UserID } from '@/domain/value-objects/ids';

export interface UploadItemImageInput {
  readonly requestId?: string;
  readonly actorUserId: UserID;
  readonly itemId: ItemID;
  readonly data: Uint8Array;
  readonly contentType: SupportedImageContentType;
}

export class UploadItemImageUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWork<Repositories>,
    private readonly storage: ImageStorage | null,
    private readonly clock: Clock,
  ) {}

  async execute(input: UploadItemImageInput): Promise<Item> {
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

      const previous = storage.filenameFromUrl(item.imageUrl ?? '');
      const saved = await storage.save(item.id.value, {
        data: input.data,
        contentType: input.contentType,
      });

      try {
        item.update({ imageUrl: saved.url, now: this.clock.now() });
        await repositories.items.update(item);
        await recordAudit(repositories, input, 'item.image.upload', {
          type: 'item',
          id: item.id.value,
        });
      } catch (error) {
        await storage.remove(saved.filename);
        throw error;
      }

      if (previous !== null && previous !== saved.filename) {
        await storage.remove(previous);
      }

      return item;
    });
  }
}

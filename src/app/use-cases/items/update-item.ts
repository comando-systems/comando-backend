import { recordAudit } from '@/app/audit';
import { requireActor } from '@/app/authorization';
import { ConflictError, NotFoundError } from '@/app/errors';
import type { Clock } from '@/app/ports/clock';
import type { UnitOfWork } from '@/app/ports/unit-of-work';
import type { Item } from '@/domain/entity/item';
import type { Repositories } from '@/domain/repository';
import type { ItemID, UserID } from '@/domain/value-objects/ids';

export interface UpdateItemInput {
  readonly requestId?: string;
  readonly actorUserId: UserID;
  readonly itemId: ItemID;
  readonly name?: string;
  readonly description?: string | null;
  readonly priceCents?: number;
  readonly category?: string;
  readonly enabled?: boolean;
  readonly imageUrl?: string | null;
}

export class UpdateItemUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWork<Repositories>,
    private readonly clock: Clock,
  ) {}

  async execute(input: UpdateItemInput): Promise<Item> {
    return this.unitOfWork.run(async (repositories) => {
      await requireActor(repositories, input.actorUserId, 'items:manage');

      const item = await repositories.items.findById(input.itemId);

      if (item === null) {
        throw new NotFoundError('Item not found');
      }

      if (!item.isActive) {
        throw new ConflictError('Removed items cannot be edited');
      }

      item.update({
        name: input.name,
        description: input.description,
        category: input.category,
        priceCents: input.priceCents,
        imageUrl: input.imageUrl,
        active: input.enabled,
        now: this.clock.now(),
      });

      await repositories.items.update(item);
      await recordAudit(repositories, input, 'item.update', { type: 'item', id: item.id.value });
      return item;
    });
  }
}

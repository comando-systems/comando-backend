import { recordAudit } from '@/app/audit';
import { requireActor } from '@/app/authorization';
import type { Clock } from '@/app/ports/clock';
import type { UnitOfWork } from '@/app/ports/unit-of-work';
import type { Item } from '@/domain/entity/item';
import type { Repositories } from '@/domain/repository';
import type { UserID } from '@/domain/value-objects/ids';

export interface CreateItemInput {
  readonly actorUserId: UserID;
  readonly name: string;
  readonly description?: string | null;
  readonly priceCents: number;
  readonly imageUrl?: string | null;
  readonly requestId?: string;
}

export class CreateItemUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWork<Repositories>,
    private readonly clock: Clock,
  ) {}

  async execute(input: CreateItemInput): Promise<Item> {
    return this.unitOfWork.run(async (repositories) => {
      const actor = await requireActor(repositories, input.actorUserId, 'items:manage');
      const now = this.clock.now();
      const item = await repositories.items.create({
        name: input.name,
        description: input.description ?? null,
        priceCents: input.priceCents,
        imageUrl: input.imageUrl ?? null,
        now,
      });

      await recordAudit(repositories, {
        actorUserId: actor.id,
        action: 'item.create',
        targetType: 'ITEM',
        targetId: item.id.value,
        requestId: input.requestId,
        metadata: { priceCents: item.price.cents },
        now,
      });

      return item;
    });
  }
}

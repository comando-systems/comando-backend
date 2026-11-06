import { recordAudit } from '@/app/audit';
import { requireActor } from '@/app/authorization';
import type { Clock } from '@/app/ports/clock';
import type { UnitOfWork } from '@/app/ports/unit-of-work';
import type { Item } from '@/domain/entity/item';
import type { Repositories } from '@/domain/repository';
import type { UserID } from '@/domain/value-objects/ids';

export interface CreateItemInput {
  readonly requestId?: string;
  readonly actorUserId: UserID;
  readonly name: string;
  readonly description?: string | null;
  readonly category?: string;
  readonly priceCents: number;
  readonly imageUrl?: string | null;
  readonly enabled?: boolean;
}

export class CreateItemUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWork<Repositories>,
    private readonly clock: Clock,
  ) {}

  async execute(input: CreateItemInput): Promise<Item> {
    return this.unitOfWork.run(async (repositories) => {
      await requireActor(repositories, input.actorUserId, 'items:manage');

      const item = await repositories.items.create({
        name: input.name,
        description: input.description ?? null,
        category: input.category,
        priceCents: input.priceCents,
        imageUrl: input.imageUrl ?? null,
        active: input.enabled,
        now: this.clock.now(),
      });

      await recordAudit(repositories, input, 'item.create', { type: 'item', id: item.id.value });
      return item;
    });
  }
}

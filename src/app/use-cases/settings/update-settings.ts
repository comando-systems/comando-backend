import { requireActor } from '@/app/authorization';
import type { Clock } from '@/app/ports/clock';
import type { UnitOfWork } from '@/app/ports/unit-of-work';
import type { Settings } from '@/domain/entity/settings';
import type { Repositories } from '@/domain/repository';
import type { UserID } from '@/domain/value-objects/ids';

export interface UpdateSettingsInput {
  readonly actorUserId: UserID;
  readonly serviceFeeEnabled?: boolean;
  // 10% is 1000.
  readonly serviceFeeBasisPoints?: number;
}

export class UpdateSettingsUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWork<Repositories>,
    private readonly clock: Clock,
  ) {}

  async execute(input: UpdateSettingsInput): Promise<Settings> {
    return this.unitOfWork.run(async (repositories) => {
      const actor = await requireActor(repositories, input.actorUserId, 'settings:manage');
      const settings = await repositories.settings.get();

      settings.update({
        serviceFeeEnabled: input.serviceFeeEnabled,
        serviceFeeBasisPoints: input.serviceFeeBasisPoints,
        byUserId: actor.id,
        now: this.clock.now(),
      });

      await repositories.settings.save(settings);
      return settings;
    });
  }
}

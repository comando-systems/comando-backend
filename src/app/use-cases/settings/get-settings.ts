import { requireActor } from '@/app/authorization';
import type { UnitOfWork } from '@/app/ports/unit-of-work';
import type { Settings } from '@/domain/entity/settings';
import type { Repositories } from '@/domain/repository';
import type { UserID } from '@/domain/value-objects/ids';

export interface GetSettingsInput {
  readonly actorUserId: UserID;
}

// The service fee shows up on every bill, so every signed-in user reads it.
export class GetSettingsUseCase {
  constructor(private readonly unitOfWork: UnitOfWork<Repositories>) {}

  async execute(input: GetSettingsInput): Promise<Settings> {
    return this.unitOfWork.read(async (repositories) => {
      await requireActor(repositories, input.actorUserId);

      return repositories.settings.get();
    });
  }
}

import { recordAudit } from '@/app/audit';
import { requireActor } from '@/app/authorization';
import { ConflictError, NotFoundError } from '@/app/errors';
import type { Clock } from '@/app/ports/clock';
import type { UnitOfWork } from '@/app/ports/unit-of-work';
import { assertCanRemoveAdministrator } from '@/app/use-cases/users/admin-safeguards';
import type { User } from '@/domain/entity/user';
import type { Repositories } from '@/domain/repository';
import type { UserID } from '@/domain/value-objects/ids';

export interface DeactivateUserInput {
  readonly requestId?: string;
  readonly actorUserId: UserID;
  readonly userId: UserID;
}

export class DeactivateUserUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWork<Repositories>,
    private readonly clock: Clock,
  ) {}

  async execute(input: DeactivateUserInput): Promise<User> {
    return this.unitOfWork.run(async (repositories) => {
      const actor = await requireActor(repositories, input.actorUserId, 'users:manage');
      await repositories.users.lockAdministration();

      const user = await repositories.users.findById(input.userId);

      if (user === null) {
        throw new NotFoundError('User not found');
      }

      if (!user.isActive) {
        throw new ConflictError('User is already deactivated');
      }

      await assertCanRemoveAdministrator(repositories, actor, user, 'deactivate');

      const now = this.clock.now();
      user.deactivate(now);
      await repositories.users.update(user);
      await repositories.refreshTokens.revokeAllForUser(user.id, now);
      await recordAudit(repositories, input, 'user.deactivate', {
        type: 'user',
        id: user.id.value,
      });
      return user;
    });
  }
}

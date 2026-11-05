import { recordAudit } from '@/app/audit';
import { requireActor } from '@/app/authorization';
import { ConflictError, NotFoundError } from '@/app/errors';
import type { Clock } from '@/app/ports/clock';
import type { UnitOfWork } from '@/app/ports/unit-of-work';
import type { User } from '@/domain/entity/user';
import type { Repositories } from '@/domain/repository';
import type { UserID } from '@/domain/value-objects/ids';

export interface DeactivateUserInput {
  readonly actorUserId: UserID;
  readonly userId: UserID;
  readonly requestId?: string;
}

export class DeactivateUserUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWork<Repositories>,
    private readonly clock: Clock,
  ) {}

  async execute(input: DeactivateUserInput): Promise<User> {
    return this.unitOfWork.run(async (repositories) => {
      const actor = await requireActor(repositories, input.actorUserId, 'users:manage');

      const user = await repositories.users.findById(input.userId);

      if (user === null) {
        throw new NotFoundError('User not found');
      }

      if (!user.isActive) {
        throw new ConflictError('User is already deactivated');
      }

      const now = this.clock.now();
      user.deactivate(now);
      await repositories.users.update(user);
      await recordAudit(repositories, {
        actorUserId: actor.id,
        action: 'user.deactivate',
        targetType: 'USER',
        targetId: user.id.value,
        requestId: input.requestId,
        now,
      });

      return user;
    });
  }
}

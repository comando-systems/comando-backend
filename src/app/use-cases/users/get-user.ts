import { requireActor } from '@/app/authorization';
import { NotFoundError } from '@/app/errors';
import type { UnitOfWork } from '@/app/ports/unit-of-work';
import type { User } from '@/domain/entity/user';
import type { Repositories } from '@/domain/repository';
import type { UserID } from '@/domain/value-objects/ids';

export interface GetUserInput {
  readonly actorUserId: UserID;
  readonly userId: UserID;
}

export class GetUserUseCase {
  constructor(private readonly unitOfWork: UnitOfWork<Repositories>) {}

  async execute(input: GetUserInput): Promise<User> {
    return this.unitOfWork.read(async (repositories) => {
      await requireActor(repositories, input.actorUserId, 'users:manage');

      const user = await repositories.users.findById(input.userId);

      if (user === null) {
        throw new NotFoundError('User not found');
      }

      return user;
    });
  }
}

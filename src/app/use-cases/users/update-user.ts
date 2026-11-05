import { recordAudit } from '@/app/audit';
import { requireActor } from '@/app/authorization';
import { ConflictError, NotFoundError, ValidationError } from '@/app/errors';
import type { Clock } from '@/app/ports/clock';
import type { PasswordHasher } from '@/app/ports/password-hasher';
import type { UnitOfWork } from '@/app/ports/unit-of-work';
import type { Role, User } from '@/domain/entity/user';
import type { Repositories } from '@/domain/repository';
import type { UserID } from '@/domain/value-objects/ids';

export interface UpdateUserInput {
  readonly actorUserId: UserID;
  readonly userId: UserID;
  readonly name?: string;
  readonly email?: string;
  readonly password?: string;
  readonly roles?: readonly Role[];
  readonly requestId?: string;
}

export class UpdateUserUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWork<Repositories>,
    private readonly passwordHasher: PasswordHasher,
    private readonly clock: Clock,
  ) {}

  async execute(input: UpdateUserInput): Promise<User> {
    if (input.password !== undefined && input.password.length === 0) {
      throw new ValidationError('Password cannot be empty');
    }

    const passwordHash =
      input.password === undefined ? undefined : await this.passwordHasher.hash(input.password);

    return this.unitOfWork.run(async (repositories) => {
      const actor = await requireActor(repositories, input.actorUserId, 'users:manage');

      const user = await repositories.users.findById(input.userId);

      if (user === null) {
        throw new NotFoundError('User not found');
      }

      if (!user.isActive) {
        throw new ConflictError('Deactivated users cannot be edited');
      }

      if (input.email !== undefined) {
        const email = input.email.trim().toLowerCase();
        const existing = await repositories.users.findByEmail(email);

        if (existing !== null && !existing.id.equals(user.id)) {
          throw new ConflictError('Email is already registered');
        }
      }

      const now = this.clock.now();
      user.update({
        name: input.name,
        email: input.email,
        roles: input.roles,
        now,
      });

      if (passwordHash !== undefined) {
        user.changePasswordHash(passwordHash, now);
      }

      await repositories.users.update(user);
      await recordAudit(repositories, {
        actorUserId: actor.id,
        action: 'user.update',
        targetType: 'USER',
        targetId: user.id.value,
        requestId: input.requestId,
        metadata: {
          changed: {
            name: input.name !== undefined,
            email: input.email !== undefined,
            password: passwordHash !== undefined,
            roles: input.roles !== undefined,
          },
          roles: user.roles,
        },
        now,
      });

      return user;
    });
  }
}

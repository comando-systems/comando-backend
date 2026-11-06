import { recordAudit } from '@/app/audit';
import { requireActor } from '@/app/authorization';
import { ConflictError, NotFoundError, ValidationError } from '@/app/errors';
import type { Clock } from '@/app/ports/clock';
import type { PasswordHasher } from '@/app/ports/password-hasher';
import type { UnitOfWork } from '@/app/ports/unit-of-work';
import { assertCanRemoveAdministrator } from '@/app/use-cases/users/admin-safeguards';
import type { Role, User } from '@/domain/entity/user';
import type { Repositories } from '@/domain/repository';
import type { UserID } from '@/domain/value-objects/ids';

export interface UpdateUserInput {
  readonly requestId?: string;
  readonly actorUserId: UserID;
  readonly userId: UserID;
  readonly name?: string;
  readonly email?: string;
  readonly password?: string;
  readonly roles?: readonly Role[];
  // `true` reactivates a deactivated user; `false` deactivates one.
  readonly isActive?: boolean;
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
      await repositories.users.lockAdministration();

      const user = await repositories.users.findById(input.userId);

      if (user === null) {
        throw new NotFoundError('User not found');
      }

      const now = this.clock.now();

      // Reactivation is the one edit a deactivated user accepts, and it comes first so the other
      // fields of the same request apply to an active user.
      if (!user.isActive) {
        if (input.isActive !== true) {
          throw new ConflictError('Deactivated users cannot be edited');
        }

        user.activate(now);
      } else if (input.isActive === false) {
        await assertCanRemoveAdministrator(repositories, actor, user, 'deactivate');
        user.deactivate(now);
      }

      if (input.roles !== undefined && !input.roles.includes('ADMIN')) {
        await assertCanRemoveAdministrator(repositories, actor, user, 'demote');
      }

      if (input.email !== undefined) {
        const email = input.email.trim().toLowerCase();
        const existing = await repositories.users.findByEmail(email);

        if (existing !== null && !existing.id.equals(user.id)) {
          throw new ConflictError('Email is already registered');
        }
      }

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
      await recordAudit(
        repositories,
        input,
        'user.update',
        { type: 'user', id: user.id.value },
        { roles: user.roles },
      );
      return user;
    });
  }
}

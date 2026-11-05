import { requireActor } from '@/app/authorization';
import { ConflictError, ValidationError } from '@/app/errors';
import type { Clock } from '@/app/ports/clock';
import type { IdGenerator } from '@/app/ports/id-generator';
import type { PasswordHasher } from '@/app/ports/password-hasher';
import type { UnitOfWork } from '@/app/ports/unit-of-work';
import { type Role, User } from '@/domain/entity/user';
import type { Repositories } from '@/domain/repository';
import { UserID } from '@/domain/value-objects/ids';

export interface CreateUserInput {
  readonly actorUserId: UserID;
  readonly name: string;
  readonly email: string;
  readonly password: string;
  readonly roles: readonly Role[];
}

export class CreateUserUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWork<Repositories>,
    private readonly passwordHasher: PasswordHasher,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: CreateUserInput): Promise<User> {
    if (input.password.length === 0) {
      throw new ValidationError('Password is required');
    }

    const passwordHash = await this.passwordHasher.hash(input.password);

    return this.unitOfWork.run(async (repositories) => {
      await requireActor(repositories, input.actorUserId, 'users:manage');

      const email = input.email.trim().toLowerCase();
      const existing = await repositories.users.findByEmail(email);

      if (existing !== null) {
        throw new ConflictError('Email is already registered');
      }

      const user = User.create({
        id: new UserID(await this.ids.next()),
        name: input.name,
        email,
        passwordHash,
        roles: input.roles,
        now: this.clock.now(),
      });

      await repositories.users.create(user);
      return user;
    });
  }
}

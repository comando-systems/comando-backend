import { UnauthorizedError } from '@/app/errors';
import type { PasswordHasher } from '@/app/ports/password-hasher';
import type { UnitOfWork } from '@/app/ports/unit-of-work';
import type { Session, SessionIssuer } from '@/app/use-cases/auth/session-issuer';
import type { Repositories } from '@/domain/repository';

export interface LoginInput {
  readonly email: string;
  readonly password: string;
}

export type LoginResult = Session;

export class LoginUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWork<Repositories>,
    private readonly passwordHasher: PasswordHasher,
    private readonly sessions: SessionIssuer,
  ) {}

  async execute(input: LoginInput): Promise<LoginResult> {
    const email = input.email.trim().toLowerCase();

    return this.unitOfWork.run(async (repositories) => {
      const user = await repositories.users.findByEmail(email);

      if (user === null || !user.isActive) {
        throw new UnauthorizedError('Invalid email or password');
      }

      const passwordMatches = await this.passwordHasher.verify(input.password, user.passwordHash);

      if (!passwordMatches) {
        throw new UnauthorizedError('Invalid email or password');
      }

      return this.sessions.open(repositories, user);
    });
  }
}

import { UnauthorizedError } from '@/app/errors';
import type { PasswordHasher } from '@/app/ports/password-hasher';
import type { TokenService } from '@/app/ports/token-service';
import type { UnitOfWork } from '@/app/ports/unit-of-work';
import type { User } from '@/domain/entity/user';
import type { Repositories } from '@/domain/repository';

export interface LoginInput {
  readonly email: string;
  readonly password: string;
}

export interface LoginResult {
  readonly user: User;
  readonly accessToken: string;
  readonly expiresAt: Date;
}

export class LoginUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWork<Repositories>,
    private readonly passwordHasher: PasswordHasher,
    private readonly tokenService: TokenService,
  ) {}

  async execute(input: LoginInput): Promise<LoginResult> {
    const email = input.email.trim().toLowerCase();

    return this.unitOfWork.read(async (repositories) => {
      const user = await repositories.users.findByEmail(email);

      if (user === null || !user.isActive) {
        throw new UnauthorizedError('Invalid email or password');
      }

      const passwordMatches = await this.passwordHasher.verify(input.password, user.passwordHash);

      if (!passwordMatches) {
        throw new UnauthorizedError('Invalid email or password');
      }

      const token = await this.tokenService.issue(user);

      return {
        user,
        accessToken: token.token,
        expiresAt: token.expiresAt,
      };
    });
  }
}

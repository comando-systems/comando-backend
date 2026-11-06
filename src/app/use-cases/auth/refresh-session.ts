import { UnauthorizedError } from '@/app/errors';
import type { Clock } from '@/app/ports/clock';
import type { RefreshTokenCodec } from '@/app/ports/refresh-token-codec';
import type { UnitOfWork } from '@/app/ports/unit-of-work';
import type { Session, SessionIssuer } from '@/app/use-cases/auth/session-issuer';
import type { Repositories } from '@/domain/repository';

export interface RefreshSessionInput {
  readonly refreshToken: string;
}

const INVALID = 'Invalid refresh token';

export class RefreshSessionUseCase {
  constructor(
    private readonly unitOfWork: UnitOfWork<Repositories>,
    private readonly codec: RefreshTokenCodec,
    private readonly sessions: SessionIssuer,
    private readonly clock: Clock,
  ) {}

  async execute(input: RefreshSessionInput): Promise<Session> {
    // A reuse must revoke every token and still answer 401. Throwing inside the transaction
    // would roll the revocation back, so the outcome is reported after it commits.
    const outcome = await this.unitOfWork.run(async (repositories) => {
      const now = this.clock.now();
      const token = await repositories.refreshTokens.findByHashForUpdate(
        this.codec.hash(input.refreshToken),
      );

      if (token === null) {
        return null;
      }

      if (token.revokedAt !== null) {
        await repositories.refreshTokens.revokeAllForUser(token.userId, now);
        return null;
      }

      if (token.expiresAt <= now) {
        return null;
      }

      const user = await repositories.users.findById(token.userId);

      if (user === null || !user.isActive) {
        return null;
      }

      await repositories.refreshTokens.revoke(token.id, now);
      return this.sessions.open(repositories, user);
    });

    if (outcome === null) {
      throw new UnauthorizedError(INVALID);
    }

    return outcome;
  }
}

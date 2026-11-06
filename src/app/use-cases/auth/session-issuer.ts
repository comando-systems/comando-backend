import type { Clock } from '@/app/ports/clock';
import type { RefreshTokenCodec } from '@/app/ports/refresh-token-codec';
import type { TokenService } from '@/app/ports/token-service';
import type { User } from '@/domain/entity/user';
import type { Repositories } from '@/domain/repository';

export interface Session {
  readonly user: User;
  readonly accessToken: string;
  readonly expiresAt: Date;
  readonly refreshToken: string;
  readonly refreshExpiresAt: Date;
}

// Opens a session: a short-lived access token plus a stored, hash-only refresh token.
export class SessionIssuer {
  constructor(
    private readonly tokenService: TokenService,
    private readonly codec: RefreshTokenCodec,
    private readonly clock: Clock,
    private readonly refreshTtlSeconds: number,
  ) {}

  async open(repositories: Repositories, user: User): Promise<Session> {
    const access = await this.tokenService.issue(user);
    const now = this.clock.now();
    const refreshToken = this.codec.generate();
    const refreshExpiresAt = new Date(now.getTime() + this.refreshTtlSeconds * 1000);

    await repositories.refreshTokens.create({
      userId: user.id,
      tokenHash: this.codec.hash(refreshToken),
      expiresAt: refreshExpiresAt,
      now,
    });

    return {
      user,
      accessToken: access.token,
      expiresAt: access.expiresAt,
      refreshToken,
      refreshExpiresAt,
    };
  }
}

import { jwtVerify, SignJWT } from 'jose';
import { UnauthorizedError } from '@/app/errors';
import type { Clock } from '@/app/ports/clock';
import type { AccessTokenClaims, IssuedAccessToken, TokenService } from '@/app/ports/token-service';
import type { User } from '@/domain/entity/user';

const ACCESS_TOKEN_TYPE = 'access';
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;

export interface JwtTokenServiceOptions {
  readonly secret: string;
  readonly issuer: string;
  readonly audience: string;
  readonly expiresInSeconds: number;
  readonly clock: Clock;
}

export class JwtTokenService implements TokenService {
  private readonly key: Uint8Array;

  constructor(private readonly options: JwtTokenServiceOptions) {
    this.key = new TextEncoder().encode(options.secret);
  }

  async issue(user: User): Promise<IssuedAccessToken> {
    const issuedAt = this.options.clock.now();
    const expiresAt = new Date(issuedAt.getTime() + this.options.expiresInSeconds * 1_000);
    const issuedAtSeconds = Math.floor(issuedAt.getTime() / 1_000);
    const expiresAtSeconds = Math.floor(expiresAt.getTime() / 1_000);

    const token = await new SignJWT({
      token_type: ACCESS_TOKEN_TYPE,
      roles: user.roles,
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(user.id.value)
      .setIssuer(this.options.issuer)
      .setAudience(this.options.audience)
      .setJti(crypto.randomUUID())
      .setIssuedAt(issuedAtSeconds)
      .setExpirationTime(expiresAtSeconds)
      .sign(this.key);

    return { token, expiresAt };
  }

  async verify(token: string): Promise<AccessTokenClaims> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ['HS256'],
        issuer: this.options.issuer,
        audience: this.options.audience,
        currentDate: this.options.clock.now(),
      });

      if (
        payload.token_type !== ACCESS_TOKEN_TYPE ||
        typeof payload.sub !== 'string' ||
        !POSITIVE_INTEGER_PATTERN.test(payload.sub) ||
        typeof payload.jti !== 'string' ||
        typeof payload.iat !== 'number' ||
        typeof payload.exp !== 'number'
      ) {
        throw new UnauthorizedError('Invalid access token');
      }

      return {
        userId: payload.sub,
        tokenId: payload.jti,
        issuedAt: new Date(payload.iat * 1_000),
        expiresAt: new Date(payload.exp * 1_000),
      };
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        throw error;
      }
      throw new UnauthorizedError('Invalid or expired access token');
    }
  }
}

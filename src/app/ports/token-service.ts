import type { User } from '@/domain/entity/user';

export interface IssuedAccessToken {
  readonly token: string;
  readonly expiresAt: Date;
}

export interface AccessTokenClaims {
  readonly userId: string;
  readonly tokenId: string;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
}

export interface TokenService {
  issue(user: User): Promise<IssuedAccessToken>;
  verify(token: string): Promise<AccessTokenClaims>;
}

import type { UserID } from '@/domain/value-objects/ids';

export interface RefreshTokenRecord {
  readonly id: string;
  readonly userId: UserID;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
}

export interface NewRefreshToken {
  readonly userId: UserID;
  // Only the hash is stored; the token itself never reaches the database.
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly now: Date;
}

export interface RefreshTokenRepository {
  create(token: NewRefreshToken): Promise<void>;
  // Locks the row for the rest of the transaction so a token is rotated at most once.
  findByHashForUpdate(tokenHash: string): Promise<RefreshTokenRecord | null>;
  revoke(id: string, now: Date): Promise<void>;
  revokeAllForUser(userId: UserID, now: Date): Promise<void>;
}

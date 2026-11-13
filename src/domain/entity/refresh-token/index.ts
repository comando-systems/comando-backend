import { requireNonEmptyString, requireValidDate } from '@/domain/entity/validation';
import type { RefreshTokenID, UserID } from '@/domain/value-objects/ids';

export interface RefreshTokenProps {
  readonly id: RefreshTokenID;
  readonly userId: UserID;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly createdAt: Date;
}

/**
 * A stored refresh token. Only the hash is kept; the token itself never reaches the database.
 */
export class RefreshToken {
  private constructor(private readonly props: RefreshTokenProps) {}

  static restore(props: RefreshTokenProps): RefreshToken {
    return new RefreshToken({
      id: props.id,
      userId: props.userId,
      tokenHash: requireNonEmptyString(props.tokenHash, 'Token hash'),
      expiresAt: requireValidDate(props.expiresAt, 'Expires at'),
      revokedAt: props.revokedAt === null ? null : requireValidDate(props.revokedAt, 'Revoked at'),
      createdAt: requireValidDate(props.createdAt, 'Created at'),
    });
  }

  get id(): RefreshTokenID {
    return this.props.id;
  }

  get userId(): UserID {
    return this.props.userId;
  }

  get tokenHash(): string {
    return this.props.tokenHash;
  }

  get expiresAt(): Date {
    return new Date(this.props.expiresAt.getTime());
  }

  get revokedAt(): Date | null {
    return this.props.revokedAt === null ? null : new Date(this.props.revokedAt.getTime());
  }

  get createdAt(): Date {
    return new Date(this.props.createdAt.getTime());
  }

  get isRevoked(): boolean {
    return this.props.revokedAt !== null;
  }

  isExpired(now: Date): boolean {
    return this.props.expiresAt.getTime() <= now.getTime();
  }
}

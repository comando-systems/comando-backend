import { RefreshToken } from '@/domain/entity/refresh-token';
import type {
  NewRefreshToken,
  RefreshTokenRepository as RefreshTokenRepositoryContract,
} from '@/domain/repository/refresh-token-repository';
import { RefreshTokenID, UserID } from '@/domain/value-objects/ids';
import type { DatabaseConnections } from '@/infrastructure/database/connections';
import { toDate } from '@/infrastructure/repositories/mapping';

interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date | string;
  revoked_at: Date | string | null;
  created_at: Date | string;
}

function mapRefreshToken(row: RefreshTokenRow): RefreshToken {
  return RefreshToken.restore({
    id: new RefreshTokenID(row.id),
    userId: new UserID(row.user_id),
    tokenHash: row.token_hash,
    expiresAt: toDate(row.expires_at),
    revokedAt: row.revoked_at === null ? null : toDate(row.revoked_at),
    createdAt: toDate(row.created_at),
  });
}

export class RefreshTokenRepository implements RefreshTokenRepositoryContract {
  constructor(private readonly database: DatabaseConnections) {}

  async create(token: NewRefreshToken): Promise<void> {
    await this.database.writeSql().query`
      INSERT INTO refresh_tokens (user_id, token_hash, expires_at, created_at)
      VALUES (${token.userId.value}, ${token.tokenHash}, ${token.expiresAt}, ${token.now})
    `;
  }

  async findByHashForUpdate(tokenHash: string): Promise<RefreshToken | null> {
    const rows = await this.database.writeSql().query<RefreshTokenRow[]>`
      SELECT
        id::text AS id,
        user_id::text AS user_id,
        token_hash,
        expires_at,
        revoked_at,
        created_at
      FROM refresh_tokens
      WHERE token_hash = ${tokenHash}
      FOR UPDATE
    `;

    const row = rows[0];
    return row === undefined ? null : mapRefreshToken(row);
  }

  async revoke(id: RefreshTokenID, now: Date): Promise<void> {
    await this.database.writeSql().query`
      UPDATE refresh_tokens SET revoked_at = ${now} WHERE id = ${id.value} AND revoked_at IS NULL
    `;
  }

  async revokeAllForUser(userId: UserID, now: Date): Promise<void> {
    await this.database.writeSql().query`
      UPDATE refresh_tokens
      SET revoked_at = ${now}
      WHERE user_id = ${userId.value} AND revoked_at IS NULL
    `;
  }
}

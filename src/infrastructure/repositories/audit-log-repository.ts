import type {
  AuditEventInput,
  AuditLogRecord,
  AuditLogRepository as AuditLogRepositoryContract,
} from '@/domain/repository/audit-log-repository';
import { UserID } from '@/domain/value-objects/ids';
import type { DatabaseConnections } from '@/infrastructure/database/connections';
import { toDate } from '@/infrastructure/repositories/mapping';

interface AuditLogRow {
  id: string;
  actor_user_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  request_id: string | null;
  metadata: Record<string, unknown>;
  created_at: Date | string;
}

function mapAuditLog(row: AuditLogRow): AuditLogRecord {
  return {
    id: row.id,
    actorUserId: row.actor_user_id === null ? null : new UserID(row.actor_user_id),
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    requestId: row.request_id,
    metadata: row.metadata,
    now: toDate(row.created_at),
  };
}

export class AuditLogRepository implements AuditLogRepositoryContract {
  constructor(private readonly database: DatabaseConnections) {}

  async record(event: AuditEventInput): Promise<AuditLogRecord> {
    const sql = this.database.writeSql();
    const rows = await sql.query<AuditLogRow[]>`
      INSERT INTO audit_logs (
        actor_user_id,
        action,
        target_type,
        target_id,
        request_id,
        metadata,
        created_at
      )
      VALUES (
        ${event.actorUserId?.value ?? null},
        ${event.action},
        ${event.targetType},
        ${event.targetId},
        ${event.requestId},
        ${sql.json(event.metadata)},
        ${event.now}
      )
      RETURNING
        id::text AS id,
        actor_user_id::text AS actor_user_id,
        action,
        target_type,
        target_id,
        request_id,
        metadata,
        created_at
    `;

    const row = rows[0];

    if (row === undefined) {
      throw new Error('Failed to record audit event');
    }

    return mapAuditLog(row);
  }

  async listRecent(limit: number): Promise<readonly AuditLogRecord[]> {
    const sql = this.database.readSql();
    const rows = await sql.query<AuditLogRow[]>`
      SELECT
        id::text AS id,
        actor_user_id::text AS actor_user_id,
        action,
        target_type,
        target_id,
        request_id,
        metadata,
        created_at
      FROM audit_logs
      ORDER BY created_at DESC, id DESC
      LIMIT ${limit}
    `;

    return rows.map(mapAuditLog);
  }
}

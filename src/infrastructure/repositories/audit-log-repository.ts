import type {
  AuditEvent,
  AuditLogRepository as AuditLogRepositoryContract,
} from '@/domain/repository/audit-log-repository';
import type { DatabaseConnections } from '@/infrastructure/database/connections';

export class AuditLogRepository implements AuditLogRepositoryContract {
  constructor(private readonly database: DatabaseConnections) {}

  async record(event: AuditEvent): Promise<void> {
    const sql = this.database.writeSql();

    await sql.query`
      INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, request_id, metadata)
      VALUES (
        ${event.actorUserId?.value ?? null},
        ${event.action},
        ${event.targetType},
        ${event.targetId},
        ${event.requestId},
        ${sql.json(event.metadata)}
      )
    `;
  }
}

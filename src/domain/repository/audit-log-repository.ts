import type { UserID } from '@/domain/value-objects/ids';

export interface AuditEventInput {
  readonly actorUserId: UserID | null;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string | null;
  readonly requestId: string | null;
  readonly metadata: Record<string, unknown>;
  readonly now: Date;
}

export interface AuditLogRecord extends AuditEventInput {
  readonly id: string;
}

export interface AuditLogRepository {
  record(event: AuditEventInput): Promise<AuditLogRecord>;
  listRecent(limit: number): Promise<readonly AuditLogRecord[]>;
}

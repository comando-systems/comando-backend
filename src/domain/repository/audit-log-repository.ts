import type { UserID } from '@/domain/value-objects/ids';

export interface AuditEvent {
  readonly actorUserId: UserID | null;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string | null;
  readonly requestId: string | null;
  // Never put credentials, tokens, or password hashes here.
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface AuditLogRepository {
  record(event: AuditEvent): Promise<void>;
}

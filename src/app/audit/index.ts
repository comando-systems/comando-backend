import type { Repositories } from '@/domain/repository';
import type { UserID } from '@/domain/value-objects/ids';

export interface RecordAuditInput {
  readonly actorUserId: UserID;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string | null;
  readonly requestId?: string;
  readonly metadata?: Record<string, unknown>;
  readonly now: Date;
}

/**
 * Records a persistent audit event inside the caller's transaction. The event
 * is intentionally separate from operational logs and never contains secrets.
 */
export async function recordAudit(
  repositories: Repositories,
  input: RecordAuditInput,
): Promise<void> {
  await repositories.audit.record({
    actorUserId: input.actorUserId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    requestId: input.requestId ?? null,
    metadata: input.metadata ?? {},
    now: input.now,
  });
}

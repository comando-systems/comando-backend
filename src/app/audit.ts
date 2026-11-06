import type { Repositories } from '@/domain/repository';
import type { UserID } from '@/domain/value-objects/ids';

export type AuditAction =
  | 'user.create'
  | 'user.update'
  | 'user.deactivate'
  | 'item.create'
  | 'item.update'
  | 'item.remove'
  | 'settings.update'
  | 'order.counter.create'
  | 'order.table.open'
  | 'order.pricing.set'
  | 'order.payment.request'
  | 'order.reopen'
  | 'order.close'
  | 'order.cancel'
  | 'auth.refresh.reuse';

// Written in the caller's transaction, so an action and its audit row commit together.
export async function recordAudit(
  repositories: Repositories,
  context: { readonly actorUserId: UserID | null; readonly requestId?: string },
  action: AuditAction,
  target: { readonly type: string; readonly id: string | null },
  metadata: Readonly<Record<string, unknown>> = {},
): Promise<void> {
  await repositories.auditLogs.record({
    actorUserId: context.actorUserId,
    action,
    targetType: target.type,
    targetId: target.id,
    requestId: context.requestId ?? null,
    metadata,
  });
}

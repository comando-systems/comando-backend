import type { AuditLog, NewAuditLog } from '@/domain/entity/audit-log';

export interface AuditLogRepository {
  create(log: NewAuditLog): Promise<AuditLog>;
}

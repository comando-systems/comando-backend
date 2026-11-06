import type { Repositories } from '@/domain/repository';
import type { DatabaseConnections } from '@/infrastructure/database/connections';
import { CountCache } from '@/infrastructure/database/count-cache';
import { AuditLogRepository } from '@/infrastructure/repositories/audit-log-repository';
import { ItemRepository } from '@/infrastructure/repositories/item-repository';
import { OrderItemRepository } from '@/infrastructure/repositories/order-item-repository';
import { OrderPaymentRepository } from '@/infrastructure/repositories/order-payment-repository';
import { OrderRepository } from '@/infrastructure/repositories/order-repository';
import { RefreshTokenRepository } from '@/infrastructure/repositories/refresh-token-repository';
import { ReportRepository } from '@/infrastructure/repositories/report-repository';
import { SettingsRepository } from '@/infrastructure/repositories/settings-repository';
import { UserRepository } from '@/infrastructure/repositories/user-repository';

export interface RepositoryOptions {
  // How long list totals are reused. 0 always counts.
  readonly countCacheTtlMs?: number;
}

export function createRepositories(
  database: DatabaseConnections,
  options: RepositoryOptions = {},
): Repositories {
  const counts = new CountCache(options.countCacheTtlMs ?? 0);
  const orderItems = new OrderItemRepository(database);
  const orderPayments = new OrderPaymentRepository(database);

  return {
    auditLogs: new AuditLogRepository(database),
    users: new UserRepository(database),
    items: new ItemRepository(database, counts),
    orders: new OrderRepository(database, orderItems, orderPayments, counts),
    orderItems,
    orderPayments,
    refreshTokens: new RefreshTokenRepository(database),
    reports: new ReportRepository(database),
    settings: new SettingsRepository(database),
  };
}

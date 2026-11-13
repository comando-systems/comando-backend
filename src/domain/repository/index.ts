import type { AuditLogRepository } from '@/domain/repository/audit-log-repository';
import type { ItemRepository } from '@/domain/repository/item-repository';
import type { OrderItemRepository } from '@/domain/repository/order-item-repository';
import type { OrderPaymentRepository } from '@/domain/repository/order-payment-repository';
import type { OrderRepository } from '@/domain/repository/order-repository';
import type { RefreshTokenRepository } from '@/domain/repository/refresh-token-repository';
import type { ReportRepository } from '@/domain/repository/report-repository';
import type { RoleRepository } from '@/domain/repository/role-repository';
import type { SettingsRepository } from '@/domain/repository/settings-repository';
import type { UserRepository } from '@/domain/repository/user-repository';
import type { UserRoleRepository } from '@/domain/repository/user-role-repository';

export interface Repositories {
  readonly auditLogs: AuditLogRepository;
  readonly users: UserRepository;
  readonly roles: RoleRepository;
  readonly userRoles: UserRoleRepository;
  readonly items: ItemRepository;
  readonly orders: OrderRepository;
  readonly orderItems: OrderItemRepository;
  readonly orderPayments: OrderPaymentRepository;
  readonly refreshTokens: RefreshTokenRepository;
  readonly reports: ReportRepository;
  readonly settings: SettingsRepository;
}

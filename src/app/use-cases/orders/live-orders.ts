import type { OrderStatus } from '@/domain/entity/order';
import type { Permission } from '@/domain/entity/role';

// Orders still being served. Everyone who works the floor or the till needs to see them, while the
// closed and canceled history is for whoever holds `orders:history`.
const LIVE_STATUSES: readonly OrderStatus[] = ['OPEN', 'AWAITING_PAYMENT'];

export const LIVE_VIEW_PERMISSIONS: readonly Permission[] = [
  'orders:history',
  'orders:open',
  'orders:update',
  'orders:close',
];

export function isLiveStatus(status: OrderStatus): boolean {
  return LIVE_STATUSES.includes(status);
}

import { ConflictError } from '@/app/errors';
import type { Order } from '@/domain/entity/order';
import type { Repositories } from '@/domain/repository';

/**
 * A named table is taken when an active order already has lines on it. The advisory lock makes
 * concurrent line changes on the same name serialize, so two orders cannot both claim it.
 */
export async function assertTableAvailable(
  repositories: Repositories,
  order: Order,
): Promise<void> {
  if (order.tableCode === null) {
    return;
  }

  await repositories.orders.lockTable(order.tableCode);
  const occupied = await repositories.orders.findOccupiedTableByCode(order.tableCode, order.id);

  if (occupied !== null) {
    throw new ConflictError('Table already has an open order', {
      code: 'TABLE_OCCUPIED',
      details: { orderId: occupied.id.value },
    });
  }
}

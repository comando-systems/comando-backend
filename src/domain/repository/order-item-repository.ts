import type { OrderItem } from '@/domain/entity/order';
import type { ItemID, OrderID } from '@/domain/value-objects/ids';

export interface OrderItemRepository {
  findByOrderId(orderId: OrderID): Promise<readonly OrderItem[]>;
  // One query for a whole page: lines grouped by order id (orders without lines are absent).
  findByOrderIds(orderIds: readonly OrderID[]): Promise<ReadonlyMap<string, readonly OrderItem[]>>;
  // Inserts or updates every line in one statement (a repeated item updates its quantity).
  upsertMany(orderId: OrderID, items: readonly OrderItem[]): Promise<void>;
  delete(orderId: OrderID, itemId: ItemID): Promise<void>;
  // Removes every line of the order that is not in `keep`.
  deleteExcept(orderId: OrderID, keep: readonly ItemID[]): Promise<void>;
}

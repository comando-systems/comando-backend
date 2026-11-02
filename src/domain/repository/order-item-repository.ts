import type { OrderItem } from '@/domain/entity/order';
import type { ItemID, OrderID } from '@/domain/value-objects/ids';

export interface OrderItemRepository {
  findByOrderId(orderId: OrderID): Promise<readonly OrderItem[]>;
  upsert(orderId: OrderID, item: OrderItem): Promise<void>;
  delete(orderId: OrderID, itemId: ItemID): Promise<void>;
}

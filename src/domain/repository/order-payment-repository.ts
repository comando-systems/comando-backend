import type { OrderPayment } from '@/domain/entity/order';
import type { OrderID } from '@/domain/value-objects/ids';

export interface OrderPaymentRepository {
  // Inserts payments of an order that has none yet, in one statement.
  add(orderId: OrderID, payments: readonly OrderPayment[]): Promise<void>;
  findByOrderId(orderId: OrderID): Promise<readonly OrderPayment[]>;
  // One query for a whole page: payments grouped by order id (orders without any are absent).
  findByOrderIds(
    orderIds: readonly OrderID[],
  ): Promise<ReadonlyMap<string, readonly OrderPayment[]>>;
  replace(orderId: OrderID, payments: readonly OrderPayment[]): Promise<void>;
}

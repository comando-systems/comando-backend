import type { OrderPayment } from '@/domain/entity/order';
import type { OrderID } from '@/domain/value-objects/ids';

export interface OrderPaymentRepository {
  findByOrderId(orderId: OrderID): Promise<readonly OrderPayment[]>;
  replace(orderId: OrderID, payments: readonly OrderPayment[]): Promise<void>;
}

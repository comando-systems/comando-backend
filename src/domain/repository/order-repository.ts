import type { Order, OrderStatus, OrderType } from '@/domain/entity/order';
import type { OrderID } from '@/domain/value-objects/ids';

export interface OrderFilters {
  readonly status?: OrderStatus;
  // Matches any of the given statuses; combined with `status` it must satisfy both.
  readonly statuses?: readonly OrderStatus[];
  readonly type?: OrderType;
  readonly tableCode?: string;
  readonly from?: Date;
  readonly to?: Date;
  readonly page: number;
  readonly pageSize: number;
}

export interface OrderPage {
  readonly orders: readonly Order[];
  readonly total: number;
}

export interface FindOrderOptions {
  readonly forUpdate?: boolean;
}

export interface OrderRepository {
  create(order: Order): Promise<void>;
  findById(id: OrderID, options?: FindOrderOptions): Promise<Order | null>;
  // The order occupying the table: open or awaiting payment.
  findActiveTableByCode(tableCode: string): Promise<Order | null>;
  save(order: Order): Promise<void>;
  list(filters: OrderFilters): Promise<OrderPage>;
}

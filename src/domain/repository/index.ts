import type { ItemRepository } from '@/domain/repository/item-repository';
import type { OrderItemRepository } from '@/domain/repository/order-item-repository';
import type { OrderRepository } from '@/domain/repository/order-repository';
import type { UserRepository } from '@/domain/repository/user-repository';

export interface Repositories {
  readonly users: UserRepository;
  readonly items: ItemRepository;
  readonly orders: OrderRepository;
  readonly orderItems: OrderItemRepository;
}

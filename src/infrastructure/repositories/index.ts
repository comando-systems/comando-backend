import type { Repositories } from '@/domain/repository';
import type { DatabaseConnections } from '@/infrastructure/database/connections';
import { ItemRepository } from '@/infrastructure/repositories/item-repository';
import { OrderItemRepository } from '@/infrastructure/repositories/order-item-repository';
import { OrderPaymentRepository } from '@/infrastructure/repositories/order-payment-repository';
import { OrderRepository } from '@/infrastructure/repositories/order-repository';
import { SettingsRepository } from '@/infrastructure/repositories/settings-repository';
import { UserRepository } from '@/infrastructure/repositories/user-repository';

export function createRepositories(database: DatabaseConnections): Repositories {
  const orderItems = new OrderItemRepository(database);
  const orderPayments = new OrderPaymentRepository(database);

  return {
    users: new UserRepository(database),
    items: new ItemRepository(database),
    orders: new OrderRepository(database, orderItems, orderPayments),
    orderItems,
    orderPayments,
    settings: new SettingsRepository(database),
  };
}

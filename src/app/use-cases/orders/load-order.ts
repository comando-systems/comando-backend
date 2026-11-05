import { ConflictError, NotFoundError } from '@/app/errors';
import type { Order } from '@/domain/entity/order';
import type { Repositories } from '@/domain/repository';
import type { OrderID } from '@/domain/value-objects/ids';

export async function findOrderForUpdate(
  repositories: Repositories,
  orderId: OrderID,
): Promise<Order> {
  const order = await repositories.orders.findById(orderId, { forUpdate: true });

  if (order === null) {
    throw new NotFoundError('Order not found');
  }

  return order;
}

export async function findTableOrderForUpdate(
  repositories: Repositories,
  orderId: OrderID,
): Promise<Order> {
  const order = await findOrderForUpdate(repositories, orderId);

  if (order.type !== 'TABLE') {
    throw new ConflictError('Only table orders can be changed');
  }

  return order;
}

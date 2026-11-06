import { describe, expect, test } from 'bun:test';
import { requireActorAny } from '@/app/authorization';
import { ForbiddenError, NotFoundError } from '@/app/errors';
import { GetOrderUseCase } from '@/app/use-cases';
import type { Repositories } from '@/domain/repository';
import { OrderID } from '@/domain/value-objects/ids';
import { fakeOrders, fakeUnitOfWork, fakeUsers, makeUser } from '../support/fakes';

const server = makeUser('1', ['SERVER']);
const repositories = {
  users: fakeUsers({ findById: async () => server }),
} as unknown as Repositories;

describe('requireActorAny', () => {
  test('accepts an actor holding any one of the permissions', async () => {
    const actor = await requireActorAny(repositories, server.id, ['orders:close', 'orders:update']);

    expect(actor).toBe(server);
  });

  test('rejects an actor holding none of them', async () => {
    await expect(
      requireActorAny(repositories, server.id, ['orders:close', 'users:manage']),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('GetOrderUseCase', () => {
  test('reports an order that does not exist', async () => {
    const useCase = new GetOrderUseCase(
      fakeUnitOfWork({
        users: fakeUsers({ findById: async () => server }),
        orders: fakeOrders({ findById: async () => null }),
      }),
    );

    await expect(
      useCase.execute({ actorUserId: server.id, orderId: new OrderID('404') }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

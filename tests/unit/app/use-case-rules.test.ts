import { describe, expect, test } from 'bun:test';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/app/errors';
import type { PasswordHasher } from '@/app/ports/password-hasher';
import {
  DeactivateUserUseCase,
  GetUserUseCase,
  ListOrdersUseCase,
  UpdateUserUseCase,
} from '@/app/use-cases';
import { findOrderForUpdate, findTableOrderForUpdate } from '@/app/use-cases/orders/load-order';
import { Item } from '@/domain/entity/item';
import { Order, type OrderStatus, type OrderType } from '@/domain/entity/order';
import { ItemID, OrderID, UserID } from '@/domain/value-objects/ids';
import { fakeOrders, fakeUnitOfWork, fakeUsers, makeUser, NOW } from '../support/fakes';

const admin = makeUser('1', ['ADMIN']);
const cashier = makeUser('2', ['CASHIER']);
const active = makeUser('10', ['SERVER']);
const deactivated = makeUser('11', ['SERVER'], true);

// Looks users up by id, like the real repository; anything unknown is missing.
const users = fakeUsers({
  findById: async (id) =>
    [admin, cashier, active, deactivated].find((u) => u.id.equals(id)) ?? null,
  findByEmail: async () => null,
  update: async () => {},
});
const unitOfWork = fakeUnitOfWork({ users });

const hasher: PasswordHasher = {
  hash: async (plain) => `hashed:${plain}`,
  verify: async () => true,
};

describe('user use cases', () => {
  test('reading a user requires the user to exist', async () => {
    const getUser = new GetUserUseCase(unitOfWork);

    await expect(
      getUser.execute({ actorUserId: admin.id, userId: new UserID('99') }),
    ).rejects.toThrow(NotFoundError);
    await expect(getUser.execute({ actorUserId: admin.id, userId: active.id })).resolves.toBe(
      active,
    );
  });

  test('only users with the permission can read users', async () => {
    const getUser = new GetUserUseCase(unitOfWork);

    await expect(getUser.execute({ actorUserId: cashier.id, userId: active.id })).rejects.toThrow(
      ForbiddenError,
    );
  });

  test('deactivating needs an existing, active user', async () => {
    const deactivate = new DeactivateUserUseCase(unitOfWork, { now: () => NOW });

    await expect(
      deactivate.execute({ actorUserId: admin.id, userId: new UserID('99') }),
    ).rejects.toThrow(NotFoundError);
    await expect(
      deactivate.execute({ actorUserId: admin.id, userId: deactivated.id }),
    ).rejects.toThrow(ConflictError);
  });

  test('updating rejects an empty password before touching anything', async () => {
    const touched: string[] = [];
    const guarded = fakeUnitOfWork({
      users: fakeUsers({
        findById: async () => {
          touched.push('findById');
          return null;
        },
      }),
    });
    const update = new UpdateUserUseCase(guarded, hasher, { now: () => NOW });

    await expect(
      update.execute({ actorUserId: admin.id, userId: active.id, password: '' }),
    ).rejects.toThrow(ValidationError);
    expect(touched).toEqual([]);
  });

  test('updating needs an existing user who has not been deactivated', async () => {
    const update = new UpdateUserUseCase(unitOfWork, hasher, { now: () => NOW });

    await expect(
      update.execute({ actorUserId: admin.id, userId: new UserID('99'), name: 'Ghost' }),
    ).rejects.toThrow(NotFoundError);
    await expect(
      update.execute({ actorUserId: admin.id, userId: deactivated.id, name: 'Late' }),
    ).rejects.toThrow(ConflictError);
  });
});

describe('listing orders', () => {
  const listOrders = new ListOrdersUseCase(
    fakeUnitOfWork({
      users,
      orders: fakeOrders({ list: async () => ({ orders: [], total: 0 }) }),
    }),
  );
  const base = { actorUserId: cashier.id, page: 1, pageSize: 20 };

  test('rejects an unknown status or type', async () => {
    await expect(
      listOrders.execute({ ...base, status: 'BOGUS' as unknown as OrderStatus }),
    ).rejects.toThrow('Invalid order status');
    await expect(
      listOrders.execute({ ...base, type: 'BOGUS' as unknown as OrderType }),
    ).rejects.toThrow('Invalid order type');
  });

  test('rejects an inverted date range', async () => {
    await expect(
      listOrders.execute({
        ...base,
        from: new Date('2026-02-01T00:00:00.000Z'),
        to: new Date('2026-01-01T00:00:00.000Z'),
      }),
    ).rejects.toThrow('From must be before To');
  });

  test('returns the page for a valid request', async () => {
    await expect(listOrders.execute({ ...base, status: 'OPEN', type: 'TABLE' })).resolves.toEqual({
      orders: [],
      total: 0,
    });
  });
});

describe('loading orders', () => {
  const counter = Order.createCounter({
    id: new OrderID('5'),
    openedByUserId: cashier.id,
    lines: [
      {
        item: Item.create({ id: new ItemID('1'), name: 'Coffee', priceCents: 500, now: NOW }),
        quantity: 1,
      },
    ],
    payments: [{ method: 'CASH', amountCents: 500 }],
    now: NOW,
  });
  const table = Order.openTable({
    id: new OrderID('6'),
    openedByUserId: active.id,
    tableCode: 'T-1',
    now: NOW,
  });
  const repositories = fakeUnitOfWork({
    orders: fakeOrders({
      findById: async (id) => [counter, table].find((order) => order.id.equals(id)) ?? null,
    }),
  });

  test('a missing order is not found', async () => {
    await expect(
      repositories.read((repos) => findOrderForUpdate(repos, new OrderID('99'))),
    ).rejects.toThrow(NotFoundError);
  });

  test('counter orders cannot be changed as table orders', async () => {
    await expect(
      repositories.read((repos) => findTableOrderForUpdate(repos, counter.id)),
    ).rejects.toThrow('Only table orders can be changed');
    await expect(
      repositories.read((repos) => findTableOrderForUpdate(repos, table.id)),
    ).resolves.toBe(table);
  });
});

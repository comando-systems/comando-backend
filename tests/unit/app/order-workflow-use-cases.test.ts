import { describe, expect, test } from 'bun:test';
import { ConflictError, ForbiddenError, ValidationError } from '@/app/errors';
import {
  GetOrderUseCase,
  ListOrdersUseCase,
  RemoveOrderItemUseCase,
  ReopenOrderUseCase,
  RequestOrderPaymentUseCase,
  SetOrderPricingUseCase,
} from '@/app/use-cases';
import { Item } from '@/domain/entity/item';
import { Order } from '@/domain/entity/order';
import { Settings } from '@/domain/entity/settings';
import type { Role } from '@/domain/entity/user';
import { User } from '@/domain/entity/user';
import { InvalidStateTransitionError, InvariantViolationError } from '@/domain/errors';
import type { Repositories } from '@/domain/repository';
import { ItemID, OrderID, UserID } from '@/domain/value-objects/ids';
import { fakeUnitOfWork } from '../support/fakes';

const now = new Date('2026-01-01T12:00:00.000Z');
const clock = { now: () => now };

function user(id: string, roles: readonly Role[]): User {
  return User.create({
    id: new UserID(id),
    name: `User ${id}`,
    email: `user-${id}@example.com`,
    passwordHash: 'hash',
    roles,
    now,
  });
}

const admin = user('1', ['ADMIN']);
const cashier = user('2', ['CASHIER']);
const server = user('3', ['SERVER']);

const coffee = Item.create({ id: new ItemID('1'), name: 'Coffee', priceCents: 1000, now });

function tableWith(lines: number, feeBasisPoints = 0): Order {
  const order = Order.openTable({
    id: new OrderID('10'),
    openedByUserId: server.id,
    tableCode: 'T-1',
    serviceFeeBasisPoints: feeBasisPoints,
    now,
  });
  if (lines > 0) {
    order.addItem(coffee, lines, now);
  }
  return order;
}

function counterOrder(): Order {
  return Order.createCounter({
    id: new OrderID('20'),
    openedByUserId: cashier.id,
    lines: [{ item: coffee, quantity: 1 }],
    payments: [{ method: 'CASH', amountCents: 1000 }],
    now,
  });
}

function closedTable(): Order {
  const order = tableWith(1);
  order.close(cashier.id, [{ method: 'PIX', amountCents: 1000 }], now);
  return order;
}

interface World {
  readonly repositories: Repositories;
  readonly saved: Order[];
}

// Fakes only the repository boundary; the use cases under test are the real ones.
function world(orders: readonly Order[], settings?: Settings): World {
  const saved: Order[] = [];
  const settingsRow =
    settings ??
    Settings.restore({
      serviceFeeEnabled: true,
      serviceFeeBasisPoints: 1000,
      updatedByUserId: null,
      updatedAt: now,
    });

  const repositories = {
    users: {
      findById: async (id: UserID) => [admin, cashier, server].find((u) => u.id.equals(id)) ?? null,
    },
    orders: {
      findById: async (id: OrderID) => orders.find((order) => order.id.equals(id)) ?? null,
      save: async (order: Order) => {
        saved.push(order);
      },
      list: async () => ({ orders: [...orders], total: orders.length }),
    },
    settings: { get: async () => settingsRow },
  } as unknown as Repositories;

  return { repositories, saved };
}

const unitOfWorkOf = ({ repositories }: World) => fakeUnitOfWork(repositories);

describe('requesting payment', () => {
  test('moves a table with items to awaiting payment and saves it', async () => {
    const w = world([tableWith(2)]);
    const useCase = new RequestOrderPaymentUseCase(unitOfWorkOf(w), clock);

    const order = await useCase.execute({ actorUserId: server.id, orderId: new OrderID('10') });

    expect(order.status).toBe('AWAITING_PAYMENT');
    expect(order.paymentRequestedByUserId?.value).toBe('3');
    expect(w.saved).toHaveLength(1);
  });

  test('the cashier may also hand a table over', async () => {
    const useCase = new RequestOrderPaymentUseCase(unitOfWorkOf(world([tableWith(1)])), clock);

    await expect(
      useCase.execute({ actorUserId: cashier.id, orderId: new OrderID('10') }),
    ).resolves.toBeDefined();
  });

  test('refuses an administrator, an empty order, and a counter order', async () => {
    const forbidden = new RequestOrderPaymentUseCase(unitOfWorkOf(world([tableWith(1)])), clock);
    const empty = new RequestOrderPaymentUseCase(unitOfWorkOf(world([tableWith(0)])), clock);
    const counter = new RequestOrderPaymentUseCase(unitOfWorkOf(world([counterOrder()])), clock);

    await expect(
      forbidden.execute({ actorUserId: admin.id, orderId: new OrderID('10') }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      empty.execute({ actorUserId: server.id, orderId: new OrderID('10') }),
    ).rejects.toBeInstanceOf(InvariantViolationError);
    await expect(
      counter.execute({ actorUserId: server.id, orderId: new OrderID('20') }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  test('cannot be asked twice', async () => {
    const order = tableWith(1);
    const useCase = new RequestOrderPaymentUseCase(unitOfWorkOf(world([order])), clock);

    await useCase.execute({ actorUserId: server.id, orderId: order.id });

    await expect(
      useCase.execute({ actorUserId: server.id, orderId: order.id }),
    ).rejects.toBeInstanceOf(InvalidStateTransitionError);
  });
});

describe('reopening', () => {
  test('returns an order awaiting payment to open', async () => {
    const order = tableWith(1);
    order.requestPayment(server.id, now);
    const useCase = new ReopenOrderUseCase(unitOfWorkOf(world([order])), clock);

    const reopened = await useCase.execute({ actorUserId: cashier.id, orderId: order.id });

    expect(reopened.status).toBe('OPEN');
    expect(reopened.paymentRequestedAt).toBeNull();
  });

  test('an open order cannot be reopened, and an administrator cannot reopen', async () => {
    const useCase = new ReopenOrderUseCase(unitOfWorkOf(world([tableWith(1)])), clock);

    await expect(
      useCase.execute({ actorUserId: cashier.id, orderId: new OrderID('10') }),
    ).rejects.toBeInstanceOf(InvalidStateTransitionError);
    await expect(
      useCase.execute({ actorUserId: admin.id, orderId: new OrderID('10') }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('removing a line', () => {
  test('removes it and refuses one that is not there', async () => {
    const useCase = new RemoveOrderItemUseCase(unitOfWorkOf(world([tableWith(1)])), clock);

    const order = await useCase.execute({
      actorUserId: server.id,
      orderId: new OrderID('10'),
      itemId: coffee.id,
    });

    expect(order.items).toHaveLength(0);
    await expect(
      useCase.execute({ actorUserId: server.id, orderId: new OrderID('10'), itemId: coffee.id }),
    ).rejects.toBeInstanceOf(InvariantViolationError);
  });

  test('is a table-order change that needs the update permission', async () => {
    const useCase = new RemoveOrderItemUseCase(unitOfWorkOf(world([tableWith(1)])), clock);

    await expect(
      useCase.execute({ actorUserId: admin.id, orderId: new OrderID('10'), itemId: coffee.id }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      useCase.execute({ actorUserId: cashier.id, orderId: new OrderID('10'), itemId: coffee.id }),
    ).resolves.toBeDefined();
  });
});

describe('pricing', () => {
  test('needs something to change', async () => {
    const useCase = new SetOrderPricingUseCase(unitOfWorkOf(world([tableWith(1)])), clock);

    await expect(
      useCase.execute({ actorUserId: cashier.id, orderId: new OrderID('10') }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  test('applies and clears a surcharge and a discount', async () => {
    const useCase = new SetOrderPricingUseCase(unitOfWorkOf(world([tableWith(2)])), clock);

    const priced = await useCase.execute({
      actorUserId: cashier.id,
      orderId: new OrderID('10'),
      surchargeCents: 300,
      discountCents: 500,
    });
    expect(priced.surcharge.cents).toBe(300);
    expect(priced.discount.cents).toBe(500);
    expect(priced.total.cents).toBe(1800);

    const cleared = await useCase.execute({
      actorUserId: cashier.id,
      orderId: new OrderID('10'),
      surchargeCents: null,
      discountCents: null,
    });
    expect(cleared.total.cents).toBe(2000);
  });

  test('changes one amount without clearing the other', async () => {
    const useCase = new SetOrderPricingUseCase(unitOfWorkOf(world([tableWith(2)])), clock);

    await useCase.execute({
      actorUserId: cashier.id,
      orderId: new OrderID('10'),
      surchargeCents: 300,
      discountCents: 500,
    });
    const changed = await useCase.execute({
      actorUserId: cashier.id,
      orderId: new OrderID('10'),
      surchargeCents: 100,
    });

    expect(changed.surcharge.cents).toBe(100);
    expect(changed.discount.cents).toBe(500);
    expect(changed.total.cents).toBe(1600);
  });

  test('the server, the cashier, and an administrator at the till may all adjust', async () => {
    const useCase = new SetOrderPricingUseCase(unitOfWorkOf(world([tableWith(1)])), clock);
    const input = { orderId: new OrderID('10'), discountCents: 100 };

    for (const actor of [server, cashier, admin]) {
      await expect(useCase.execute({ ...input, actorUserId: actor.id })).resolves.toBeDefined();
    }
  });

  test('the service fee takes the current rate from the settings, and none when switched off', async () => {
    const enabled = new SetOrderPricingUseCase(unitOfWorkOf(world([tableWith(1)])), clock);
    const off = new SetOrderPricingUseCase(
      unitOfWorkOf(
        world(
          [tableWith(1)],
          Settings.restore({
            serviceFeeEnabled: false,
            serviceFeeBasisPoints: 1000,
            updatedByUserId: null,
            updatedAt: now,
          }),
        ),
      ),
      clock,
    );

    const withFee = await enabled.execute({
      actorUserId: server.id,
      orderId: new OrderID('10'),
      applyServiceFee: true,
    });
    const switchedOff = await off.execute({
      actorUserId: server.id,
      orderId: new OrderID('10'),
      applyServiceFee: true,
    });

    expect(withFee.total.cents).toBe(1100);
    expect(switchedOff.total.cents).toBe(1000);
  });
});

describe('who can see which orders', () => {
  const live = [tableWith(1)];

  test('servers and cashiers list the orders still being served', async () => {
    const useCase = new ListOrdersUseCase(unitOfWorkOf(world(live)));
    const base = { page: 1, pageSize: 20, statuses: ['OPEN', 'AWAITING_PAYMENT'] } as const;

    for (const actor of [server, cashier]) {
      await expect(useCase.execute({ ...base, actorUserId: actor.id })).resolves.toMatchObject({
        total: 1,
      });
    }
    await expect(
      useCase.execute({ ...base, actorUserId: server.id, status: 'OPEN', statuses: undefined }),
    ).resolves.toBeDefined();
  });

  test('history, or any request that could include it, needs the history permission', async () => {
    const useCase = new ListOrdersUseCase(unitOfWorkOf(world(live)));
    const base = { actorUserId: server.id, page: 1, pageSize: 20 };

    await expect(useCase.execute(base)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(useCase.execute({ ...base, status: 'CLOSED' })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(useCase.execute({ ...base, statuses: ['OPEN', 'CLOSED'] })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(
      useCase.execute({ ...base, actorUserId: cashier.id, status: 'CLOSED' }),
    ).resolves.toBeDefined();
  });

  test('an administrator reads the history, so lists any status', async () => {
    const useCase = new ListOrdersUseCase(unitOfWorkOf(world(live)));

    await expect(
      useCase.execute({ actorUserId: admin.id, page: 1, pageSize: 20, statuses: ['OPEN'] }),
    ).resolves.toBeDefined();
    await expect(
      useCase.execute({ actorUserId: admin.id, page: 1, pageSize: 20, status: 'CLOSED' }),
    ).resolves.toBeDefined();
  });

  test('rejects an unknown status in the list', async () => {
    const useCase = new ListOrdersUseCase(unitOfWorkOf(world(live)));

    await expect(
      useCase.execute({
        actorUserId: cashier.id,
        page: 1,
        pageSize: 20,
        statuses: ['OPEN', 'BOGUS' as never],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  test('a server follows a live order but not a closed one', async () => {
    const open = tableWith(1);
    const closed = closedTable();
    const useCase = new GetOrderUseCase(unitOfWorkOf(world([open, counterOrder(), closed])));

    await expect(useCase.execute({ actorUserId: server.id, orderId: open.id })).resolves.toBe(open);
    await expect(
      useCase.execute({ actorUserId: server.id, orderId: new OrderID('20') }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      useCase.execute({ actorUserId: cashier.id, orderId: new OrderID('20') }),
    ).resolves.toBeDefined();
  });

  test('an administrator reads an order, live or closed', async () => {
    const useCase = new GetOrderUseCase(unitOfWorkOf(world([tableWith(1), counterOrder()])));

    await expect(
      useCase.execute({ actorUserId: admin.id, orderId: new OrderID('10') }),
    ).resolves.toBeDefined();
    await expect(
      useCase.execute({ actorUserId: admin.id, orderId: new OrderID('20') }),
    ).resolves.toBeDefined();
  });
});

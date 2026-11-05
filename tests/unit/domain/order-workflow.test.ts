import { describe, expect, test } from 'bun:test';
import { Item } from '@/domain/entity/item';
import { Order, OrderPayment, type OrderProps } from '@/domain/entity/order';
import {
  InvalidStateTransitionError,
  InvalidValueError,
  InvariantViolationError,
} from '@/domain/errors';
import { ItemID, OrderID, UserID } from '@/domain/value-objects/ids';

const now = new Date('2026-01-01T12:00:00.000Z');
const later = new Date('2026-01-01T13:00:00.000Z');
const server = new UserID('1');
const cashier = new UserID('2');

function item(
  id: string,
  priceCents: number,
  extra: Partial<Parameters<typeof Item.create>[0]> = {},
) {
  return Item.create({ id: new ItemID(id), name: `Item ${id}`, priceCents, now, ...extra });
}

function table(feeBasisPoints?: number): Order {
  return Order.openTable({
    id: new OrderID('10'),
    openedByUserId: server,
    tableCode: 'T-1',
    serviceFeeBasisPoints: feeBasisPoints,
    now,
  });
}

describe('opening a table', () => {
  test('charges the service fee by default and snapshots the rate', () => {
    const order = table(1000);

    expect(order.applyServiceFee).toBe(true);
    expect(order.serviceFeeBasisPoints).toBe(1000);
    expect(order.status).toBe('OPEN');
    expect(order.label).toBeNull();
  });

  test('computes the total with the fee', () => {
    const order = table(1000);
    order.addItem(item('1', 1000), 2, now);

    expect(order.subtotal.cents).toBe(2000);
    expect(order.pricing.serviceFee.cents).toBe(200);
    expect(order.total.cents).toBe(2200);
  });
});

describe('payment request handoff', () => {
  test('moves an order with items to awaiting payment and records who asked', () => {
    const order = table();
    order.addItem(item('1', 500), 1, now);
    const version = order.version;

    order.requestPayment(server, later);

    expect(order.status).toBe('AWAITING_PAYMENT');
    expect(order.paymentRequestedByUserId?.value).toBe('1');
    expect(order.paymentRequestedAt).toEqual(later);
    expect(order.version).toBe(version + 1);
  });

  test('refuses an empty order', () => {
    expect(() => table().requestPayment(server, later)).toThrow(InvariantViolationError);
  });

  test('refuses an order that already left the open state', () => {
    const order = table();
    order.addItem(item('1', 500), 1, now);
    order.requestPayment(server, later);

    expect(() => order.requestPayment(server, later)).toThrow(InvalidStateTransitionError);
  });

  test('is only for table orders', () => {
    const counter = Order.createCounter({
      id: new OrderID('11'),
      openedByUserId: cashier,
      lines: [{ item: item('1', 500), quantity: 1 }],
      payments: [{ method: 'CASH', amountCents: 500 }],
      now,
    });

    expect(() => counter.requestPayment(cashier, later)).toThrow(InvalidStateTransitionError);
  });

  test('locks the lines until the order is reopened', () => {
    const order = table();
    const coffee = item('1', 500);
    order.addItem(coffee, 1, now);
    order.requestPayment(server, later);

    expect(() => order.addItem(coffee, 1, later)).toThrow(InvalidStateTransitionError);
    expect(() => order.changeItemQuantity(coffee.id, 2, later)).toThrow(
      InvalidStateTransitionError,
    );
    expect(() => order.removeItem(coffee.id, later)).toThrow(InvalidStateTransitionError);
  });

  test('reopening returns to open and clears the request', () => {
    const order = table();
    const coffee = item('1', 500);
    order.addItem(coffee, 1, now);
    order.requestPayment(server, later);

    order.reopen(later);
    order.addItem(coffee, 1, later);

    expect(order.status).toBe('OPEN');
    expect(order.paymentRequestedAt).toBeNull();
    expect(order.paymentRequestedByUserId).toBeNull();
    expect(order.getItem(coffee.id)?.quantity).toBe(2);
  });

  test('reopening only applies to orders awaiting payment', () => {
    expect(() => table().reopen(later)).toThrow(InvalidStateTransitionError);
  });
});

describe('closing and canceling', () => {
  function awaiting(feeBasisPoints = 1000): Order {
    const order = table(feeBasisPoints);
    order.addItem(item('1', 1000), 2, now);
    order.requestPayment(server, now);
    return order;
  }

  test('the cashier closes an order awaiting payment with the exact total', () => {
    const order = awaiting();

    order.close(cashier, [{ method: 'PIX', amountCents: 2200 }], later);

    expect(order.status).toBe('CLOSED');
    expect(order.closedByUserId?.value).toBe('2');
    expect(order.closedAt).toEqual(later);
    expect(order.payments.map((payment) => payment.amountCents)).toEqual([2200]);
  });

  test('a cashier can also close an order that is still open', () => {
    const order = table(0);
    order.addItem(item('1', 700), 1, now);

    order.close(cashier, [{ method: 'CASH', amountCents: 700 }], later);

    expect(order.status).toBe('CLOSED');
  });

  test('payments must match the total including the service fee', () => {
    expect(() => awaiting().close(cashier, [{ method: 'PIX', amountCents: 2000 }], later)).toThrow(
      InvariantViolationError,
    );
    expect(() => awaiting().close(cashier, [], later)).toThrow(InvariantViolationError);
  });

  test('accepts split payments that add up', () => {
    const order = awaiting();

    order.close(
      cashier,
      [
        { method: 'CASH', amountCents: 1200, receivedCents: 2000 },
        { method: 'PIX', amountCents: 1000 },
      ],
      later,
    );

    expect(order.payments[0]?.changeCents).toBe(800);
    expect(order.payments[1]?.changeCents).toBeNull();
  });

  test('a zero-total order needs no payments', () => {
    const order = table(0);
    order.addItem(item('1', 0), 1, now);

    order.close(cashier, [], later);

    expect(order.status).toBe('CLOSED');
    expect(order.total.cents).toBe(0);
  });

  test('cancels an open order and one awaiting payment', () => {
    const open = table();
    open.cancel(cashier, later);
    expect(open.status).toBe('CANCELED');
    expect(open.canceledByUserId?.value).toBe('2');

    const waiting = awaiting();
    waiting.cancel(server, later);
    expect(waiting.status).toBe('CANCELED');
    expect(waiting.canceledAt).toEqual(later);
  });

  test('closed and canceled orders are terminal', () => {
    const closed = awaiting();
    closed.close(cashier, [{ method: 'PIX', amountCents: 2200 }], later);
    const canceled = table();
    canceled.cancel(cashier, later);

    for (const order of [closed, canceled]) {
      expect(() => order.cancel(cashier, later)).toThrow(InvalidStateTransitionError);
      expect(() => order.close(cashier, [], later)).toThrow(InvalidStateTransitionError);
      expect(() => order.reopen(later)).toThrow(InvalidStateTransitionError);
      expect(() => order.setAdjustment(null, later)).toThrow(InvalidStateTransitionError);
      expect(() => order.setServiceFee(false, 0, later)).toThrow(InvalidStateTransitionError);
      expect(() => order.addItem(item('2', 100), 1, later)).toThrow(InvalidStateTransitionError);
    }
  });
});

describe('lines', () => {
  test('removes a line and recomputes the total', () => {
    const order = table(0);
    const coffee = item('1', 500);
    const cake = item('2', 300);
    order.addItem(coffee, 1, now);
    order.addItem(cake, 1, now);

    order.removeItem(coffee.id, later);

    expect(order.items.map((line) => line.itemId.value)).toEqual(['2']);
    expect(order.total.cents).toBe(300);
    expect(() => order.removeItem(coffee.id, later)).toThrow(InvariantViolationError);
  });

  test('adding the same item again updates the single line', () => {
    const order = table();
    const coffee = item('1', 500);

    order.addItem(coffee, 1, now);
    order.addItem(coffee, 2, later);

    expect(order.items).toHaveLength(1);
    expect(order.getItem(coffee.id)?.quantity).toBe(3);
  });

  test('keeps the price the item had when it was added', () => {
    const order = table(0);
    const coffee = item('1', 500);
    order.addItem(coffee, 1, now);

    coffee.update({ priceCents: 900, now: later });

    expect(order.total.cents).toBe(500);
  });

  test('rejects items that are disabled or removed', () => {
    const order = table();
    const disabled = item('1', 500, { active: false });
    const removed = item('2', 500);
    removed.remove(later);

    expect(() => order.addItem(disabled, 1, now)).toThrow(InvariantViolationError);
    expect(() => order.addItem(removed, 1, now)).toThrow(InvariantViolationError);
  });
});

describe('pricing changes', () => {
  test('applies and clears an adjustment while awaiting payment', () => {
    const order = table(0);
    order.addItem(item('1', 1000), 1, now);
    order.requestPayment(server, now);

    order.setAdjustment({ type: 'DISCOUNT', mode: 'PERCENT', value: 1000 }, later);
    expect(order.total.cents).toBe(900);

    order.setAdjustment(null, later);
    expect(order.total.cents).toBe(1000);
  });

  test('rejects an invalid adjustment', () => {
    expect(() =>
      table().setAdjustment({ type: 'DISCOUNT', mode: 'PERCENT', value: 20_000 }, later),
    ).toThrow(InvalidValueError);
  });

  test('toggles the service fee and snapshots the rate', () => {
    const order = table(1000);
    order.addItem(item('1', 1000), 1, now);
    expect(order.total.cents).toBe(1100);

    order.setServiceFee(false, 1000, later);
    expect(order.applyServiceFee).toBe(false);
    expect(order.serviceFeeBasisPoints).toBe(0);
    expect(order.total.cents).toBe(1000);

    order.setServiceFee(true, 500, later);
    expect(order.serviceFeeBasisPoints).toBe(500);
    expect(order.total.cents).toBe(1050);
  });

  test('every change bumps the version', () => {
    const order = table();
    const version = order.version;

    order.setServiceFee(false, 0, later);

    expect(order.version).toBe(version + 1);
  });
});

describe('counter orders', () => {
  const coffee = item('1', 1000);

  test('is created closed with the label, adjustment, and fee', () => {
    const order = Order.createCounter({
      id: new OrderID('11'),
      openedByUserId: cashier,
      label: '  Maria  ',
      lines: [{ item: coffee, quantity: 2 }],
      adjustment: { type: 'DISCOUNT', mode: 'FIXED', value: 500 },
      serviceFeeBasisPoints: 1000,
      payments: [{ method: 'CASH', amountCents: 1650, receivedCents: 2000 }],
      now,
    });

    expect(order.status).toBe('CLOSED');
    expect(order.label).toBe('Maria');
    expect(order.pricing.adjustment.cents).toBe(-500);
    expect(order.total.cents).toBe(1650);
    expect(order.payments[0]?.changeCents).toBe(350);
  });

  test('has no fee unless one is requested, and treats a blank label as none', () => {
    const order = Order.createCounter({
      id: new OrderID('11'),
      openedByUserId: cashier,
      label: '   ',
      lines: [{ item: coffee, quantity: 1 }],
      payments: [{ method: 'PIX', amountCents: 1000 }],
      now,
    });

    expect(order.applyServiceFee).toBe(false);
    expect(order.label).toBeNull();
    expect(order.total.cents).toBe(1000);
  });

  test('payments that do not cover the total are rejected', () => {
    expect(() =>
      Order.createCounter({
        id: new OrderID('11'),
        openedByUserId: cashier,
        lines: [{ item: coffee, quantity: 1 }],
        serviceFeeBasisPoints: 1000,
        payments: [{ method: 'PIX', amountCents: 1000 }],
        now,
      }),
    ).toThrow(InvariantViolationError);
  });
});

describe('cash tender', () => {
  test('derives the change from the amount received', () => {
    const payment = OrderPayment.create({ method: 'CASH', amountCents: 1650, receivedCents: 2000 });

    expect(payment.receivedCents).toBe(2000);
    expect(payment.changeCents).toBe(350);
    expect(payment.toJSON()).toEqual({
      method: 'CASH',
      amountCents: 1650,
      receivedCents: 2000,
      changeCents: 350,
    });
  });

  test('rejects less than the amount, and a tender on other methods', () => {
    expect(() =>
      OrderPayment.create({ method: 'CASH', amountCents: 1000, receivedCents: 999 }),
    ).toThrow(InvalidValueError);
    expect(() =>
      OrderPayment.create({ method: 'PIX', amountCents: 1000, receivedCents: 1000 }),
    ).toThrow(InvalidValueError);
  });

  test('accepts exact cash with no change', () => {
    const payment = OrderPayment.create({ method: 'CASH', amountCents: 500, receivedCents: 500 });

    expect(payment.changeCents).toBe(0);
  });
});

describe('restoring persisted orders', () => {
  function props(overrides: Partial<OrderProps> = {}): OrderProps {
    return {
      id: new OrderID('10'),
      type: 'TABLE',
      status: 'OPEN',
      tableCode: 'T-1',
      label: null,
      openedByUserId: server,
      closedByUserId: null,
      canceledByUserId: null,
      paymentRequestedByUserId: null,
      paymentRequestedAt: null,
      adjustment: null,
      applyServiceFee: true,
      serviceFeeBasisPoints: 1000,
      openedAt: now,
      closedAt: null,
      canceledAt: null,
      createdAt: now,
      updatedAt: now,
      version: 3,
      ...overrides,
    };
  }

  test('restores an order awaiting payment', () => {
    const order = Order.restore(
      props({
        status: 'AWAITING_PAYMENT',
        paymentRequestedByUserId: server,
        paymentRequestedAt: now,
      }),
      [],
    );

    expect(order.status).toBe('AWAITING_PAYMENT');
    expect(order.paymentRequestedAt).toEqual(now);
  });

  test('rejects an order awaiting payment that does not record the request', () => {
    expect(() => Order.restore(props({ status: 'AWAITING_PAYMENT' }), [])).toThrow(
      InvariantViolationError,
    );
  });

  test('rejects a fee rate on an order that does not charge the fee', () => {
    expect(() => Order.restore(props({ applyServiceFee: false }), [])).toThrow(
      InvariantViolationError,
    );
  });
});

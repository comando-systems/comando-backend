import { describe, expect, test } from 'bun:test';
import { Item } from '@/domain/entity/item';
import { Order } from '@/domain/entity/order';
import {
  InvalidStateTransitionError,
  InvalidValueError,
  InvariantViolationError,
} from '@/domain/errors';
import { ItemID, OrderID, UserID } from '@/domain/value-objects/ids';

const now = new Date('2026-01-01T12:00:00.000Z');
const later = new Date('2026-01-01T13:00:00.000Z');

function createItem(id: string, priceCents: number, name = `Item ${id}`): Item {
  return Item.create({
    id: new ItemID(id),
    name,
    priceCents,
    now,
  });
}

function createTableOrder(): Order {
  return Order.openTable({
    id: new OrderID('10'),
    openedByUserId: new UserID('1'),
    tableCode: 'T-01',
    now,
  });
}

describe('Order', () => {
  test('creates a counter order directly as CLOSED and calculates its total', () => {
    const order = Order.createCounter({
      id: new OrderID('1'),
      openedByUserId: new UserID('1'),
      lines: [
        { item: createItem('1', 750), quantity: 2 },
        { item: createItem('2', 300), quantity: 1 },
      ],
      now,
    });

    expect(order.type).toBe('COUNTER');
    expect(order.status).toBe('CLOSED');
    expect(order.closedByUserId?.value).toBe('1');
    expect(order.closedAt).toEqual(now);
    expect(order.total.cents).toBe(1800);
    expect(order.items).toHaveLength(2);
  });

  test('combines repeated counter lines for the same item', () => {
    const order = Order.createCounter({
      id: new OrderID('1'),
      openedByUserId: new UserID('1'),
      lines: [
        { item: createItem('1', 750), quantity: 1 },
        { item: createItem('1', 750), quantity: 2 },
      ],
      now,
    });

    expect(order.items).toHaveLength(1);
    expect(order.items[0]?.quantity).toBe(3);
    expect(order.total.cents).toBe(2250);
  });

  test('rejects an empty counter order', () => {
    expect(() =>
      Order.createCounter({
        id: new OrderID('1'),
        openedByUserId: new UserID('1'),
        lines: [],
        now,
      }),
    ).toThrow(InvalidValueError);
  });

  test('opens an empty table order', () => {
    const order = createTableOrder();

    expect(order.type).toBe('TABLE');
    expect(order.status).toBe('OPEN');
    expect(order.tableCode).toBe('T-01');
    expect(order.items).toHaveLength(0);
    expect(order.total.cents).toBe(0);
  });

  test('increments an existing line instead of duplicating it', () => {
    const order = createTableOrder();
    const item = createItem('1', 750);

    order.addItem(item, 1, now);
    order.addItem(item, 2, later);

    expect(order.items).toHaveLength(1);
    expect(order.items[0]?.quantity).toBe(3);
    expect(order.total.cents).toBe(2250);
    expect(order.version).toBe(3);
  });

  test('changes an absolute quantity and preserves the unit price snapshot', () => {
    const order = createTableOrder();
    const item = createItem('1', 750);

    order.addItem(item, 2, now);
    item.update({ priceCents: 1000, now: later });
    order.changeItemQuantity(new ItemID('1'), 5, later);

    expect(order.items[0]?.quantity).toBe(5);
    expect(order.items[0]?.unitPrice.cents).toBe(750);
    expect(order.total.cents).toBe(3750);
  });

  test('rejects invalid quantities and removed items', () => {
    const order = createTableOrder();
    const item = createItem('1', 750);

    expect(() => order.addItem(item, 0, now)).toThrow(InvalidValueError);
    expect(() => order.addItem(item, -1, now)).toThrow(InvalidValueError);
    expect(() => order.changeItemQuantity(new ItemID('1'), 1, now)).toThrow(
      InvariantViolationError,
    );

    item.remove(later);
    expect(() => order.addItem(item, 1, later)).toThrow(InvariantViolationError);
  });

  test('closes an open table order and rejects further changes', () => {
    const order = createTableOrder();

    order.close(new UserID('2'), later);

    expect(order.status).toBe('CLOSED');
    expect(order.closedByUserId?.value).toBe('2');
    expect(order.closedAt).toEqual(later);
    expect(() => order.addItem(createItem('1', 750), 1, later)).toThrow(
      InvalidStateTransitionError,
    );
    expect(() => order.cancel(new UserID('1'), later)).toThrow(InvalidStateTransitionError);
  });

  test('cancels an open table order and rejects closing it afterwards', () => {
    const order = createTableOrder();

    order.cancel(new UserID('1'), later);

    expect(order.status).toBe('CANCELED');
    expect(order.canceledByUserId?.value).toBe('1');
    expect(order.canceledAt).toEqual(later);
    expect(() => order.close(new UserID('2'), later)).toThrow(InvalidStateTransitionError);
  });

  test('allows closing an empty table order', () => {
    const order = createTableOrder();

    order.close(new UserID('2'), later);

    expect(order.status).toBe('CLOSED');
    expect(order.total.cents).toBe(0);
  });

  test('restores persisted orders with their lines', () => {
    const original = createTableOrder();
    original.addItem(createItem('1', 750), 2, now);

    const restored = Order.restore(
      {
        id: original.id,
        type: original.type,
        status: original.status,
        tableCode: original.tableCode,
        openedByUserId: original.openedByUserId,
        closedByUserId: original.closedByUserId,
        canceledByUserId: original.canceledByUserId,
        openedAt: original.openedAt,
        closedAt: original.closedAt,
        canceledAt: original.canceledAt,
        createdAt: original.createdAt,
        updatedAt: original.updatedAt,
        version: original.version,
      },
      original.items,
    );

    expect(restored.total.cents).toBe(1500);
    expect(restored.items).toHaveLength(1);
  });
});

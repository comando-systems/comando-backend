import { describe, expect, test } from 'bun:test';
import { ItemID, OrderID, UserID } from '@/domain/value-objects/ids';
import { Money } from '@/domain/value-objects/money';
import { OrderItemKey } from '@/domain/value-objects/order-item-key';

describe('serialization', () => {
  test('identifiers serialize as plain strings', () => {
    const id = new UserID('5');

    expect(id.toString()).toBe('5');
    expect(JSON.stringify({ id })).toBe('{"id":"5"}');
  });

  test('money serializes as integer cents', () => {
    expect(JSON.stringify({ total: Money.fromCents(1250) })).toBe('{"total":1250}');
  });

  test('an order line key exposes both identifiers', () => {
    const key = new OrderItemKey(new OrderID('10'), new ItemID('20'));

    expect(key.toString()).toBe('10:20');
    expect(key.toJSON()).toEqual({ orderId: '10', itemId: '20' });
  });
});

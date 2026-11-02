import { describe, expect, test } from 'bun:test';
import { ItemID, OrderID } from '@/domain/value-objects/ids';
import { OrderItemKey } from '@/domain/value-objects/order-item-key';

describe('OrderItemKey', () => {
  test('compares both identifiers by value', () => {
    const key = new OrderItemKey(new OrderID('10'), new ItemID('20'));

    expect(key.equals(new OrderItemKey(new OrderID('10'), new ItemID('20')))).toBe(true);
    expect(key.equals(new OrderItemKey(new OrderID('10'), new ItemID('21')))).toBe(false);
    expect(key.equals(new OrderItemKey(new OrderID('11'), new ItemID('20')))).toBe(false);
    expect(key.equals(null)).toBe(false);
  });

  test('exposes immutable typed identifiers', () => {
    const key = new OrderItemKey(new OrderID('10'), new ItemID('20'));

    expect(key.orderId.value).toBe('10');
    expect(key.itemId.value).toBe('20');
    expect(Object.isFrozen(key.value)).toBe(true);
    expect(key.toString()).toBe('10:20');
  });
});

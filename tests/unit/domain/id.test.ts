import { describe, expect, test } from 'bun:test';
import { InvalidValueError } from '@/domain/errors';
import { ItemID, OrderID, UserID } from '@/domain/value-objects/ids';

describe('ID', () => {
  test('normalizes surrounding whitespace', () => {
    expect(new UserID(' 42 ').value).toBe('42');
  });

  test('rejects invalid identifiers', () => {
    for (const value of ['', '0', '01', '-1', '1.5', 'abc', '1e3']) {
      expect(() => new UserID(value)).toThrow(InvalidValueError);
    }
  });

  test('compares by value and type', () => {
    expect(new UserID('7').equals(new UserID('7'))).toBe(true);
    expect(new UserID('7').equals(new UserID('8'))).toBe(false);
    expect(new UserID('7').equals(new ItemID('7') as unknown as UserID)).toBe(false);
    expect(new OrderID('7').toString()).toBe('7');
  });
});

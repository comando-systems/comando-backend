import { describe, expect, test } from 'bun:test';
import { InvalidValueError } from '@/domain/errors';
import { Money } from '@/domain/value-objects/money';

describe('Money', () => {
  test('uses integer cents', () => {
    expect(Money.fromCents(1234).cents).toBe(1234);
    expect(Money.fromCents(0).isZero()).toBe(true);
    expect(Money.fromCents(-1).isNegative()).toBe(true);
  });

  test('rejects non-integer and unsafe amounts', () => {
    for (const value of [1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => Money.fromCents(value)).toThrow(InvalidValueError);
    }
  });

  test('adds, subtracts, and multiplies without floating point arithmetic', () => {
    expect(Money.fromCents(100).add(Money.fromCents(250)).cents).toBe(350);
    expect(Money.fromCents(500).subtract(Money.fromCents(125)).cents).toBe(375);
    expect(Money.fromCents(199).multiply(3).cents).toBe(597);
  });

  test('rejects invalid multipliers and overflow', () => {
    expect(() => Money.fromCents(100).multiply(0)).toThrow(InvalidValueError);
    expect(() => Money.fromCents(100).multiply(-1)).toThrow(InvalidValueError);
    expect(() => Money.fromCents(100).multiply(1.5)).toThrow(InvalidValueError);
    expect(() => Money.fromCents(Number.MAX_SAFE_INTEGER).add(Money.fromCents(1))).toThrow(
      'Money arithmetic overflow',
    );
  });

  test('compares by value', () => {
    expect(Money.fromCents(100).equals(Money.fromCents(100))).toBe(true);
    expect(Money.fromCents(100).equals(Money.fromCents(101))).toBe(false);
  });

  test('formats minor units for display', () => {
    expect(Money.fromCents(1234).format('pt-BR', 'BRL')).toContain('12,34');
    expect(Money.fromCents(100).format('en-US', 'USD')).toContain('1.00');
  });
});

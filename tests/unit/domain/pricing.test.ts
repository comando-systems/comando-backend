import { describe, expect, test } from 'bun:test';
import { calculatePricing } from '@/domain/entity/order/pricing';
import { InvalidValueError } from '@/domain/errors';
import { Money } from '@/domain/value-objects/money';

function price(subtotal: number, surcharge = 0, discount = 0, feeBasisPoints = 0) {
  const result = calculatePricing({
    subtotal: Money.fromCents(subtotal),
    surcharge: Money.fromCents(surcharge),
    discount: Money.fromCents(discount),
    serviceFeeBasisPoints: feeBasisPoints,
  });

  return {
    subtotal: result.subtotal.cents,
    surcharge: result.surcharge.cents,
    discount: result.discount.cents,
    serviceFee: result.serviceFee.cents,
    total: result.total.cents,
  };
}

describe('pricing', () => {
  test('without amounts or fee the total is the subtotal', () => {
    expect(price(2550)).toEqual({
      subtotal: 2550,
      surcharge: 0,
      discount: 0,
      serviceFee: 0,
      total: 2550,
    });
  });

  test('adds a surcharge', () => {
    expect(price(5000, 700)).toEqual({
      subtotal: 5000,
      surcharge: 700,
      discount: 0,
      serviceFee: 0,
      total: 5700,
    });
  });

  test('subtracts a discount', () => {
    expect(price(5000, 0, 1200)).toEqual({
      subtotal: 5000,
      surcharge: 0,
      discount: 1200,
      serviceFee: 0,
      total: 3800,
    });
  });

  test('applies a surcharge and a discount at the same time, then the fee on the result', () => {
    // 5000 + 700 - 1200 = 4500, then 10% fee = 450.
    expect(price(5000, 700, 1200, 1000)).toEqual({
      subtotal: 5000,
      surcharge: 700,
      discount: 1200,
      serviceFee: 450,
      total: 4950,
    });
  });

  test('a discount may consume the whole adjusted amount', () => {
    expect(price(1000, 200, 1200, 1000)).toEqual({
      subtotal: 1000,
      surcharge: 200,
      discount: 1200,
      serviceFee: 0,
      total: 0,
    });
  });

  test('rejects a discount above the subtotal plus the surcharge', () => {
    expect(() => price(1000, 0, 1001)).toThrow(InvalidValueError);
    expect(() => price(1000, 200, 1201)).toThrow(InvalidValueError);
  });

  test('rounds half up on integer cents', () => {
    // 12.5% of 1004 = 125.5 -> 126, of 1001 = 125.125 -> 125.
    expect(price(1004, 0, 0, 1250).serviceFee).toBe(126);
    expect(price(1001, 0, 0, 1250).serviceFee).toBe(125);
    expect(price(5, 0, 0, 1000).serviceFee).toBe(1); // 0.5 -> 1
    expect(price(4, 0, 0, 1000).serviceFee).toBe(0); // 0.4 -> 0
  });

  test('stays exact for very large amounts', () => {
    const huge = 8_000_000_000_000_000; // subtotal * basis points exceeds 2^53: float math drifts
    expect(price(huge, 0, 0, 1000).serviceFee).toBe(800_000_000_000_000);
  });

  test('refuses a total that no longer fits a safe integer', () => {
    expect(() => price(9_000_000_000_000_000, 0, 0, 1000)).toThrow(InvalidValueError);
  });

  test('matches the floating-point formula the app uses for realistic amounts', () => {
    let seed = 12_345;
    const next = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed;
    };

    for (let index = 0; index < 500; index += 1) {
      const subtotal = next() % 1_000_000;
      const surcharge = next() % 50_000;
      const discount = next() % (subtotal + surcharge + 1);
      const feeBp = next() % 2001;
      const base = subtotal + surcharge - discount;
      const fee = Math.round((base * feeBp) / 10_000);

      const result = price(subtotal, surcharge, discount, feeBp);

      expect(result.surcharge).toBe(surcharge);
      expect(result.discount).toBe(discount);
      expect(result.serviceFee).toBe(fee);
      expect(result.total).toBe(base + fee);
    }
  });

  test('rejects negative amounts and invalid fee rates', () => {
    expect(() => price(1000, -1)).toThrow(InvalidValueError);
    expect(() => price(1000, 0, -1)).toThrow(InvalidValueError);
    expect(() => price(1000, 0, 0, 10_001)).toThrow(InvalidValueError);
    expect(() => price(1000, 0, 0, -1)).toThrow(InvalidValueError);
    expect(() => price(1000, 0, 0, 1.5)).toThrow(InvalidValueError);
  });
});

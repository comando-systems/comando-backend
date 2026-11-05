import { describe, expect, test } from 'bun:test';
import {
  type Adjustment,
  calculatePricing,
  requireAdjustment,
} from '@/domain/entity/order/pricing';
import { InvalidValueError } from '@/domain/errors';
import { Money } from '@/domain/value-objects/money';

function price(subtotal: number, adjustment: Adjustment | null = null, feeBasisPoints = 0) {
  const result = calculatePricing({
    subtotal: Money.fromCents(subtotal),
    adjustment,
    serviceFeeBasisPoints: feeBasisPoints,
  });

  return {
    subtotal: result.subtotal.cents,
    adjustment: result.adjustment.cents,
    serviceFee: result.serviceFee.cents,
    total: result.total.cents,
  };
}

describe('pricing', () => {
  test('without adjustment or fee the total is the subtotal', () => {
    expect(price(2550)).toEqual({ subtotal: 2550, adjustment: 0, serviceFee: 0, total: 2550 });
  });

  test('applies a percent discount, then the service fee on the discounted amount', () => {
    // 10% off 10000 = 9000, then 10% fee on 9000 = 900.
    expect(price(10_000, { type: 'DISCOUNT', mode: 'PERCENT', value: 1000 }, 1000)).toEqual({
      subtotal: 10_000,
      adjustment: -1000,
      serviceFee: 900,
      total: 9900,
    });
  });

  test('applies a fixed surcharge', () => {
    expect(price(5000, { type: 'SURCHARGE', mode: 'FIXED', value: 700 })).toEqual({
      subtotal: 5000,
      adjustment: 700,
      serviceFee: 0,
      total: 5700,
    });
  });

  test('applies a percent surcharge with a decimal percentage', () => {
    // 12.5% of 8000 = 1000.
    expect(price(8000, { type: 'SURCHARGE', mode: 'PERCENT', value: 1250 }).adjustment).toBe(1000);
  });

  test('never discounts more than the subtotal', () => {
    expect(price(1000, { type: 'DISCOUNT', mode: 'FIXED', value: 5000 }, 1000)).toEqual({
      subtotal: 1000,
      adjustment: -1000,
      serviceFee: 0,
      total: 0,
    });
    expect(price(1000, { type: 'DISCOUNT', mode: 'PERCENT', value: 10_000 }).total).toBe(0);
  });

  test('rounds half up on integer cents', () => {
    // 12.5% of 1004 = 125.5 -> 126, of 1001 = 125.125 -> 125.
    const surcharge = (subtotal: number) =>
      price(subtotal, { type: 'SURCHARGE', mode: 'PERCENT', value: 1250 }).adjustment;

    expect(surcharge(1004)).toBe(126);
    expect(surcharge(1001)).toBe(125);
    expect(price(5, null, 1000).serviceFee).toBe(1); // 0.5 -> 1
    expect(price(4, null, 1000).serviceFee).toBe(0); // 0.4 -> 0
  });

  test('stays exact for very large amounts', () => {
    const huge = 8_000_000_000_000_000; // subtotal * basis points exceeds 2^53: float math drifts
    expect(price(huge, null, 1000).serviceFee).toBe(800_000_000_000_000);
  });

  test('refuses a total that no longer fits a safe integer', () => {
    expect(() => price(9_000_000_000_000_000, null, 1000)).toThrow(InvalidValueError);
  });

  test('matches the floating-point formula the app uses for realistic amounts', () => {
    let seed = 12_345;
    const next = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed;
    };

    for (let index = 0; index < 500; index += 1) {
      const subtotal = next() % 1_000_000;
      const adjustmentBp = next() % 10_001;
      const feeBp = next() % 2001;
      const discount = Math.min(Math.round((subtotal * adjustmentBp) / 10_000), subtotal);
      const base = subtotal - discount;
      const fee = Math.round((base * feeBp) / 10_000);

      const result = price(
        subtotal,
        { type: 'DISCOUNT', mode: 'PERCENT', value: adjustmentBp },
        feeBp,
      );

      expect(result.adjustment).toBe(-discount);
      expect(result.serviceFee).toBe(fee);
      expect(result.total).toBe(Math.max(0, base + fee));
    }
  });

  test('rejects invalid adjustments and rates', () => {
    const bad: Array<[string, Adjustment]> = [
      ['type', { type: 'BONUS' as never, mode: 'FIXED', value: 1 }],
      ['mode', { type: 'DISCOUNT', mode: 'RATIO' as never, value: 1 }],
      ['negative', { type: 'DISCOUNT', mode: 'FIXED', value: -1 }],
      ['fraction', { type: 'DISCOUNT', mode: 'FIXED', value: 1.5 }],
      ['percent above 100%', { type: 'DISCOUNT', mode: 'PERCENT', value: 10_001 }],
    ];

    for (const [, adjustment] of bad) {
      expect(() => requireAdjustment(adjustment)).toThrow(InvalidValueError);
    }
    expect(() => price(1000, null, 10_001)).toThrow(InvalidValueError);
    expect(() => price(1000, null, -1)).toThrow(InvalidValueError);
    expect(() => price(1000, null, 1.5)).toThrow(InvalidValueError);
  });
});

import { InvalidValueError } from '@/domain/errors';
import { Money } from '@/domain/value-objects/money';

export type AdjustmentType = 'DISCOUNT' | 'SURCHARGE';
export type AdjustmentMode = 'PERCENT' | 'FIXED';

export const ADJUSTMENT_TYPES: readonly AdjustmentType[] = Object.freeze(['DISCOUNT', 'SURCHARGE']);
export const ADJUSTMENT_MODES: readonly AdjustmentMode[] = Object.freeze(['PERCENT', 'FIXED']);

// 100% expressed in basis points. Percentages are integers so decimals (12.5%) stay exact.
export const MAX_BASIS_POINTS = 10_000;

/**
 * `value` is basis points for PERCENT and cents for FIXED.
 */
export interface Adjustment {
  readonly type: AdjustmentType;
  readonly mode: AdjustmentMode;
  readonly value: number;
}

export interface PricingInput {
  readonly subtotal: Money;
  readonly adjustment: Adjustment | null;
  // Zero when the order does not charge a service fee.
  readonly serviceFeeBasisPoints: number;
}

export interface PricingBreakdown {
  readonly subtotal: Money;
  // Signed: negative for a discount, positive for a surcharge.
  readonly adjustment: Money;
  readonly serviceFee: Money;
  readonly total: Money;
}

export function requireBasisPoints(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0 || value > MAX_BASIS_POINTS) {
    throw new InvalidValueError(`${field} must be an integer between 0 and ${MAX_BASIS_POINTS}`);
  }

  return value;
}

export function requireAdjustment(adjustment: Adjustment): Adjustment {
  if (!ADJUSTMENT_TYPES.includes(adjustment.type)) {
    throw new InvalidValueError('Invalid adjustment type');
  }
  if (!ADJUSTMENT_MODES.includes(adjustment.mode)) {
    throw new InvalidValueError('Invalid adjustment mode');
  }
  if (!Number.isSafeInteger(adjustment.value) || adjustment.value < 0) {
    throw new InvalidValueError('Adjustment value must be a non-negative integer');
  }
  if (adjustment.mode === 'PERCENT') {
    requireBasisPoints(adjustment.value, 'Adjustment percentage');
  }

  return Object.freeze({ type: adjustment.type, mode: adjustment.mode, value: adjustment.value });
}

// Half-up rounding on integer cents, exact for any safe amount (no floating point).
function percentOf(cents: number, basisPoints: number): number {
  return Number((BigInt(cents) * BigInt(basisPoints) + 5000n) / 10000n);
}

/**
 * subtotal -> adjustment -> service fee -> total. A discount never exceeds the subtotal, and the
 * service fee is charged on the adjusted amount.
 */
export function calculatePricing(input: PricingInput): PricingBreakdown {
  const subtotal = input.subtotal.cents;
  const adjustment = input.adjustment;

  let adjustmentCents = 0;
  if (adjustment !== null) {
    const raw =
      adjustment.mode === 'PERCENT' ? percentOf(subtotal, adjustment.value) : adjustment.value;
    adjustmentCents = adjustment.type === 'DISCOUNT' ? -Math.min(raw, subtotal) : raw;
  }

  const base = subtotal + adjustmentCents;
  const serviceFee = percentOf(
    base,
    requireBasisPoints(input.serviceFeeBasisPoints, 'Service fee'),
  );

  return {
    subtotal: Money.fromCents(subtotal),
    adjustment: Money.fromCents(adjustmentCents),
    serviceFee: Money.fromCents(serviceFee),
    total: Money.fromCents(Math.max(0, base + serviceFee)),
  };
}

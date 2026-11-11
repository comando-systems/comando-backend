import { InvalidValueError } from '@/domain/errors';
import { Money } from '@/domain/value-objects/money';

// 100% expressed in basis points. Percentages are integers so decimals (12.5%) stay exact.
export const MAX_BASIS_POINTS = 10_000;

export interface PricingInput {
  readonly subtotal: Money;
  readonly surcharge: Money;
  readonly discount: Money;
  // Zero when the order does not charge a service fee.
  readonly serviceFeeBasisPoints: number;
}

export interface PricingBreakdown {
  readonly subtotal: Money;
  readonly surcharge: Money;
  readonly discount: Money;
  readonly serviceFee: Money;
  readonly total: Money;
}

export function requireBasisPoints(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0 || value > MAX_BASIS_POINTS) {
    throw new InvalidValueError(`${field} must be an integer between 0 and ${MAX_BASIS_POINTS}`);
  }

  return value;
}

export function requireNonNegativeMoney(value: Money, field: string): Money {
  if (value.isNegative()) {
    throw new InvalidValueError(`${field} cannot be negative`);
  }

  return Money.fromCents(value.cents);
}

// Half-up rounding on integer cents, exact for any safe amount (no floating point).
function percentOf(cents: number, basisPoints: number): number {
  return Number((BigInt(cents) * BigInt(basisPoints) + 5000n) / 10000n);
}

/**
 * subtotal + surcharge - discount, then the service fee on the adjusted amount. The surcharge and
 * the discount are independent, so both may apply at once, and a discount never exceeds the
 * adjusted subtotal.
 */
export function calculatePricing(input: PricingInput): PricingBreakdown {
  const subtotal = input.subtotal.cents;
  const surcharge = requireNonNegativeMoney(input.surcharge, 'Surcharge').cents;
  const discount = requireNonNegativeMoney(input.discount, 'Discount').cents;
  const adjusted = subtotal + surcharge;

  if (discount > adjusted) {
    throw new InvalidValueError('Discount cannot exceed the subtotal plus the surcharge');
  }

  const base = adjusted - discount;
  const serviceFee = percentOf(
    base,
    requireBasisPoints(input.serviceFeeBasisPoints, 'Service fee'),
  );

  return {
    subtotal: Money.fromCents(subtotal),
    surcharge: Money.fromCents(surcharge),
    discount: Money.fromCents(discount),
    serviceFee: Money.fromCents(serviceFee),
    total: Money.fromCents(base + serviceFee),
  };
}

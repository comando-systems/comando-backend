import { InvalidValueError } from '@/domain/errors';
import { ValueObject } from '@/domain/value-objects/value-object';

/**
 * Monetary amount represented only by integer minor units (cents).
 */
export class Money extends ValueObject<number> {
  private constructor(cents: number) {
    if (!Number.isSafeInteger(cents)) {
      throw new InvalidValueError('Money must be an integer number of cents');
    }

    super(cents);
  }

  static fromCents(cents: number): Money {
    return new Money(cents);
  }

  static zero(): Money {
    return new Money(0);
  }

  get cents(): number {
    return this.props;
  }

  add(other: Money): Money {
    return new Money(this.checked(this.props + other.props));
  }

  subtract(other: Money): Money {
    return new Money(this.checked(this.props - other.props));
  }

  multiply(quantity: number): Money {
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      throw new InvalidValueError('Money multiplier must be a positive integer');
    }

    return new Money(this.checked(this.props * quantity));
  }

  isZero(): boolean {
    return this.props === 0;
  }

  isNegative(): boolean {
    return this.props < 0;
  }

  format(locale = 'pt-BR', currency = 'BRL'): string {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(this.props / 100);
  }

  toJSON(): number {
    return this.props;
  }

  private checked(value: number): number {
    if (!Number.isSafeInteger(value)) {
      throw new InvalidValueError('Money arithmetic overflow');
    }
    return value;
  }
}

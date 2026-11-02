import { InvalidValueError } from '@/domain/errors';
import { ValueObject } from '@/domain/value-objects/value-object';

const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;
declare const idType: unique symbol;

/**
 * Typed identifier backed by a positive integer serialized as a decimal string.
 * Strings avoid precision loss for PostgreSQL BIGINT values.
 */
export abstract class ID<T> extends ValueObject<string> {
  declare readonly [idType]: T;

  protected constructor(value: string) {
    const normalized = value.trim();

    if (!POSITIVE_INTEGER_PATTERN.test(normalized)) {
      throw new InvalidValueError(`Invalid ${new.target.name}: expected a positive integer`);
    }

    super(normalized);
  }

  override toString(): string {
    return this.props;
  }

  toJSON(): string {
    return this.props;
  }
}

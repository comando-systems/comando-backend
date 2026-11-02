/**
 * Base class for immutable value objects with value-based equality.
 *
 * Equality is restricted to the same runtime type so that typed identifiers
 * with the same underlying value are not considered interchangeable.
 */
export abstract class ValueObject<T> {
  protected readonly props: T;

  protected constructor(props: T) {
    this.props = Object.freeze(props);
  }

  get value(): T {
    return this.props;
  }

  equals(other: ValueObject<T> | null | undefined): boolean {
    if (other === null || other === undefined) {
      return false;
    }

    if (Object.getPrototypeOf(this) !== Object.getPrototypeOf(other)) {
      return false;
    }

    return Object.is(this.props, other.props);
  }
}

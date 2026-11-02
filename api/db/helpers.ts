// Helpers for treating unexpected empty query results as errors and for
// converting PostgreSQL int8 values to domain numbers.

/** Narrows an optional row to a required one, throwing if the query returned nothing. */
export function requireRow<T>(
  row: T | undefined,
  message = "Database operation returned no row",
): T {
  if (row === undefined) {
    throw new Error(message);
  }

  return row;
}

/** Converts a PostgreSQL int8 value into the number used by the domain. */
export function toNumber(value: bigint): number {
  return Number(value);
}

/** Converts a nullable PostgreSQL int8 value into a nullable domain number. */
export function toNullableNumber(value: bigint | null): number | null {
  return value === null ? null : toNumber(value);
}

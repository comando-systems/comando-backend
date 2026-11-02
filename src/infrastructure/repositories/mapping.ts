export function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function toNullableDate(value: Date | string | null): Date | null {
  return value === null ? null : toDate(value);
}

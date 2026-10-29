export function requireRow<T>(
  row: T | undefined,
  message = "Database operation returned no row",
): T {
  if (row === undefined) {
    throw new Error(message);
  }

  return row;
}

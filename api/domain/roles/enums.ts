// Supported role names stored in the roles table. Role names are an API contract.
export const ROLE_NAMES = ["ADMIN", "CAIXA", "GARCOM"] as const;

export type RoleName = (typeof ROLE_NAMES)[number];

/** Narrows untrusted strings to a supported role name. */
export function isRoleName(value: string): value is RoleName {
  return (ROLE_NAMES as readonly string[]).includes(value);
}

/** Keeps only supported role names, preserving order and dropping unknown values. */
export function knownRoleNames(values: readonly string[]): RoleName[] {
  return values.filter(isRoleName);
}

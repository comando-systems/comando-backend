export const ROLE_NAMES = ["ADMIN", "CAIXA", "GARCOM"] as const;

export type RoleName = (typeof ROLE_NAMES)[number];

export const PERMISSIONS = [
  "users:manage",
  "products:read",
  "products:manage",
  "sessions:read",
  "sessions:open",
  "sessions:close",
  "sessions:cancel",
  "items:manage",
  "payments:read",
  "payments:create",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<RoleName, readonly Permission[]> = {
  ADMIN: PERMISSIONS,
  CAIXA: [
    "products:read",
    "sessions:read",
    "sessions:open",
    "sessions:close",
    "items:manage",
    "payments:read",
    "payments:create",
  ],
  GARCOM: [
    "products:read",
    "sessions:read",
    "sessions:open",
    "items:manage",
  ],
};

export function isRoleName(value: string): value is RoleName {
  return (ROLE_NAMES as readonly string[]).includes(value);
}

export function permissionsFor(roles: readonly string[]): Set<Permission> {
  const permissions = new Set<Permission>();

  for (const role of roles) {
    if (isRoleName(role)) {
      for (const permission of ROLE_PERMISSIONS[role]) {
        permissions.add(permission);
      }
    }
  }

  return permissions;
}

export function can(
  roles: readonly string[],
  permission: Permission,
): boolean {
  return permissionsFor(roles).has(permission);
}

// Central authorization matrix. Permissions are additive across roles, so a
// user with CAIXA + GARCOM receives the union of both permission sets.
import { isRoleName, type RoleName } from "./enums";

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

/** Collects permissions from every recognized role; unknown roles are ignored. */
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

/** Checks one permission against the combined role set. */
export function can(
  roles: readonly string[],
  permission: Permission,
): boolean {
  return permissionsFor(roles).has(permission);
}

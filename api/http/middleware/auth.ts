// Bearer-token authentication and per-route permission enforcement.
import { ForbiddenError, UnauthorizedError } from "@/app/errors";
import { verifyToken } from "@/app/auth/token";
import {
  can,
  knownRoleNames,
  type Permission,
  type RoleName,
} from "@/domain/roles";
import { userRepository } from "@/domain/repositories";
import type { User } from "@/domain/users";

// Authenticated actor plus the role names recognized from its token owner.
export interface AuthContext {
  user: User;
  roles: RoleName[];
}

/** Resolves the bearer token to an active user and its known roles. */
export async function authenticate(request: Request): Promise<AuthContext> {
  const header = request.headers.get("authorization");
  // Accept only the standard `Bearer <token>` form, case-insensitively.
  const match = header ? /^Bearer\s+(.+)$/i.exec(header) : null;

  if (!match?.[1]) {
    throw new UnauthorizedError();
  }

  const payload = verifyToken(match[1].trim());
  // Re-read the user so deactivated accounts lose access before token expiry.
  const found = await userRepository.findWithRoles(payload.sub);

  if (!found || !found.user.active) {
    throw new UnauthorizedError("Invalid or expired token");
  }

  // Unknown stored role names are ignored rather than granting access.
  const roles = knownRoleNames(found.roles);

  if (roles.length === 0) {
    throw new ForbiddenError("User has no roles assigned");
  }

  return { user: found.user, roles };
}

/** Throws when the actor's combined roles do not grant the permission. */
export function requirePermission(
  context: AuthContext,
  permission: Permission,
): void {
  if (!can(context.roles, permission)) {
    throw new ForbiddenError(`Missing permission: ${permission}`);
  }
}

/** Authenticates the caller and enforces the required permission in one step. */
export async function authorize(
  request: Request,
  permission: Permission,
): Promise<AuthContext> {
  const actor = await authenticate(request);
  requirePermission(actor, permission);
  return actor;
}

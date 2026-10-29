import { ForbiddenError, UnauthorizedError } from "@/app/errors";
import { verifyToken } from "@/app/auth/token";
import type { User } from "@/db/schema/users";
import {
  can,
  isRoleName,
  type Permission,
  type RoleName,
} from "@/domain/roles/permissions";
import { userRepository } from "@/domain/users/repositories/user.repository";

export interface AuthContext {
  user: User;
  roles: RoleName[];
}

export async function authenticate(request: Request): Promise<AuthContext> {
  const header = request.headers.get("authorization");
  const match = header ? /^Bearer\s+(.+)$/i.exec(header) : null;

  if (!match?.[1]) {
    throw new UnauthorizedError();
  }

  const payload = verifyToken(match[1].trim());
  const found = await userRepository.findWithRoles(payload.sub);

  if (!found || !found.user.active) {
    throw new UnauthorizedError("Invalid or expired token");
  }

  const roles = found.roles.filter(isRoleName);

  if (roles.length === 0) {
    throw new ForbiddenError("User has no roles assigned");
  }

  return { user: found.user, roles };
}

export function requirePermission(
  context: AuthContext,
  permission: Permission,
): void {
  if (!can(context.roles, permission)) {
    throw new ForbiddenError(`Missing permission: ${permission}`);
  }
}

// Maps user rows plus roles to the public API shape. Never exposes password hashes.
import type { PublicUser, User, UserWithRoles } from ".";

/** Presents a user with deduplicated roles. */
export function toPublicUser({ user, roles }: UserWithRoles): PublicUser {
  return toPublicUserFrom(user, roles);
}

/** Presents a user from a row and any role source (auth login, admin API). */
export function toPublicUserFrom(
  user: User,
  roles: readonly string[],
): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    active: user.active,
    roles: [...new Set(roles)],
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

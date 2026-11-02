// User existence invariant shared by authentication and administration flows.
import { NotFoundError } from "@/app/errors";
import type { User, UserWithRoles } from "./types";

function userNotFound(): NotFoundError {
  return new NotFoundError("User not found", "USER_NOT_FOUND");
}

/** Narrows a lookup result to an existing user. */
export function requireUser(user: User | undefined): User {
  if (!user) {
    throw userNotFound();
  }

  return user;
}

/** Narrows a role-enriched lookup result to an existing user. */
export function requireUserWithRoles(
  row: UserWithRoles | undefined,
): UserWithRoles {
  if (!row) {
    throw userNotFound();
  }

  return row;
}

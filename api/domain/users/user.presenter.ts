import type { User } from "@/db/schema/users";
import type { UserWithRoles } from "./repositories/user.repository";

export interface PublicUser {
  id: number;
  name: string;
  email: string;
  active: boolean;
  roles: string[];
  createdAt: Date;
  updatedAt: Date;
}

export function toPublicUser({ user, roles }: UserWithRoles): PublicUser {
  return toPublicUserFrom(user, roles);
}

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

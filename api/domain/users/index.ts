// Public barrel for the users domain module. Passwords are plaintext only on
// validated input; persisted rows expose only passwordHash internally.
import type { RoleName } from "@/domain/roles";

export interface User {
  id: number;
  name: string;
  email: string;
  passwordHash: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type NewUser = Pick<User, "name" | "email" | "passwordHash"> &
  Partial<Pick<User, "active" | "createdAt" | "updatedAt">>;

/** A user plus its flattened role names, used by presenters and auth. */
export interface UserWithRoles {
  user: User;
  roles: string[];
}

export type PublicUser = Omit<User, "passwordHash"> & {
  roles: string[];
};

export type CreateUserInput = Pick<User, "name" | "email"> & {
  password: string;
  roles: RoleName[];
};

export type UpdateUserInput = Partial<
  Pick<User, "name" | "email" | "active">
> & {
  password?: string;
};

export * from "./IUser.repository";
export * from "./rules";
export * from "./user.presenter";

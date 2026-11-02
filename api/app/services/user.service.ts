// User administration use cases: accounts, roles, and deactivation.
import { hashPassword } from "@/app/auth/password";
import {
  ConflictError,
  ValidationError,
  isUniqueViolation,
} from "@/app/errors";
import type { TransactionManager } from "@/app/transaction";
import type {
  IRoleRepository,
  RoleName,
  RoleSummary,
} from "@/domain/roles";
import {
  requireUser,
  requireUserWithRoles,
  toPublicUser,
  type CreateUserInput,
  type IUserRepository,
  type NewUser,
  type PublicUser,
  type UpdateUserInput,
} from "@/domain/users";

function emailConflict(): ConflictError {
  return new ConflictError("EMAIL_IN_USE", "Email is already in use");
}

function rethrowUniqueEmailError(error: unknown): never {
  if (isUniqueViolation(error)) {
    throw emailConflict();
  }

  throw error;
}

/** Manages users and their role assignments. */
export class UserService {
  constructor(
    private readonly users: IUserRepository,
    private readonly roles: IRoleRepository,
    private readonly transactions: TransactionManager,
  ) {}

  /** Lists all users with their roles. */
  async list(): Promise<PublicUser[]> {
    const rows = await this.users.findAllWithRoles();
    return rows.map(toPublicUser);
  }

  /** Lists assignable roles. */
  async listRoles(): Promise<RoleSummary[]> {
    const roles = await this.roles.findAll();
    return roles.map((role) => ({ id: role.id, name: role.name }));
  }

  /** Returns a user with roles or throws USER_NOT_FOUND. */
  async getById(id: number): Promise<PublicUser> {
    const row = requireUserWithRoles(await this.users.findWithRoles(id));
    return toPublicUser(row);
  }

  /** Creates a user and assigns roles in one transaction. */
  async create(input: CreateUserInput): Promise<PublicUser> {
    // Deduplicate roles before validating and assigning them.
    const roleNames = this.normalizeRoleNames(input.roles);
    const existing = await this.users.findByEmail(input.email);

    if (existing) {
      throw emailConflict();
    }

    const roleIds = await this.findRoleIds(roleNames);
    const passwordHash = await hashPassword(input.password);

    try {
      // User row and role assignments must succeed or fail together.
      const user = await this.transactions.transaction(async (client) => {
        const created = await this.users.create(
          {
            name: input.name,
            email: input.email,
            passwordHash,
          },
          client,
        );

        await this.roles.replaceUserRoles(created.id, roleIds, client);

        return created;
      });

      return toPublicUser({ user, roles: roleNames });
    } catch (error) {
      // Map the database unique constraint to a stable API error.
      rethrowUniqueEmailError(error);
    }
  }

  /** Updates account fields; actors cannot deactivate themselves. */
  async update(
    id: number,
    input: UpdateUserInput,
    actorId: number,
  ): Promise<PublicUser> {
    const existing = requireUser(await this.users.findById(id));

    if (input.active === false && id === actorId) {
      throw new ConflictError(
        "CANNOT_DEACTIVATE_SELF",
        "Users cannot deactivate their own account",
      );
    }

    const data: Partial<NewUser> = {};

    if (input.name !== undefined) {
      data.name = input.name;
    }

    if (input.email !== undefined && input.email !== existing.email) {
      const duplicate = await this.users.findByEmail(input.email);

      if (duplicate && duplicate.id !== id) {
        throw emailConflict();
      }

      data.email = input.email;
    }

    if (input.active !== undefined) {
      data.active = input.active;
    }

    if (input.password !== undefined) {
      data.passwordHash = await hashPassword(input.password);
    }

    try {
      requireUser(await this.users.update(id, data));
    } catch (error) {
      // Concurrent requests may still hit the unique email constraint.
      rethrowUniqueEmailError(error);
    }

    return this.getById(id);
  }

  /** Replaces all role assignments atomically. */
  async setRoles(id: number, roles: RoleName[]): Promise<PublicUser> {
    const roleNames = this.normalizeRoleNames(roles);
    requireUser(await this.users.findById(id));
    const roleIds = await this.findRoleIds(roleNames);

    await this.transactions.transaction((client) =>
      this.roles.replaceUserRoles(id, roleIds, client),
    );

    return this.getById(id);
  }

  /** Deactivates an account without deleting its history. */
  async deactivate(id: number, actorId: number): Promise<PublicUser> {
    return this.update(id, { active: false }, actorId);
  }

  private normalizeRoleNames(roles: readonly RoleName[]): RoleName[] {
    const names = [...new Set(roles)];

    if (names.length === 0) {
      throw new ValidationError("At least one role is required", "roles");
    }

    return names;
  }

  private async findRoleIds(names: readonly RoleName[]): Promise<number[]> {
    const rows = await this.roles.findByNames(names);

    if (rows.length !== names.length) {
      throw new ValidationError("One or more roles are unknown", "roles");
    }

    return rows.map((role) => role.id);
  }
}

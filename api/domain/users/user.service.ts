import {
  ConflictError,
  NotFoundError,
  ValidationError,
  isUniqueViolation,
} from "@/app/errors";
import { hashPassword } from "@/app/auth/password";
import type { TransactionManager } from "@/app/transaction";
import type { NewUser } from "@/db/schema/users";
import type { RoleName } from "@/domain/roles/permissions";
import type { IRoleRepository } from "@/domain/roles/repositories/role.repository";
import type { IUserRepository } from "./repositories/user.repository";
import { toPublicUser, type PublicUser } from "./user.presenter";

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  roles: RoleName[];
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  password?: string;
  active?: boolean;
}

export class UserService {
  constructor(
    private readonly users: IUserRepository,
    private readonly roles: IRoleRepository,
    private readonly transactions: TransactionManager,
  ) {}

  async list(): Promise<PublicUser[]> {
    const rows = await this.users.findAllWithRoles();
    return rows.map(toPublicUser);
  }

  async listRoles(): Promise<Array<{ id: number; name: string }>> {
    const roles = await this.roles.findAll();
    return roles.map((role) => ({ id: role.id, name: role.name }));
  }

  async getById(id: number): Promise<PublicUser> {
    const row = await this.users.findWithRoles(id);

    if (!row) {
      throw new NotFoundError("User not found", "USER_NOT_FOUND");
    }

    return toPublicUser(row);
  }

  async create(input: CreateUserInput): Promise<PublicUser> {
    const roleNames = [...new Set(input.roles)];

    if (roleNames.length === 0) {
      throw new ValidationError("At least one role is required", "roles");
    }

    const existing = await this.users.findByEmail(input.email);

    if (existing) {
      throw new ConflictError("EMAIL_IN_USE", "Email is already in use");
    }

    const roleRows = await this.roles.findByNames(roleNames);

    if (roleRows.length !== roleNames.length) {
      throw new ValidationError("One or more roles are unknown", "roles");
    }

    const passwordHash = await hashPassword(input.password);

    try {
      const user = await this.transactions.transaction(async (client) => {
        const created = await this.users.create(
          {
            name: input.name,
            email: input.email,
            passwordHash,
          },
          client,
        );

        await this.roles.replaceUserRoles(
          created.id,
          roleRows.map((role) => role.id),
          client,
        );

        return created;
      });

      return toPublicUser({ user, roles: roleNames });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError("EMAIL_IN_USE", "Email is already in use");
      }

      throw error;
    }
  }

  async update(
    id: number,
    input: UpdateUserInput,
    actorId: number,
  ): Promise<PublicUser> {
    const existing = await this.users.findById(id);

    if (!existing) {
      throw new NotFoundError("User not found", "USER_NOT_FOUND");
    }

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
        throw new ConflictError("EMAIL_IN_USE", "Email is already in use");
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
      const updated = await this.users.update(id, data);

      if (!updated) {
        throw new NotFoundError("User not found", "USER_NOT_FOUND");
      }
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError("EMAIL_IN_USE", "Email is already in use");
      }

      throw error;
    }

    return this.getById(id);
  }

  async setRoles(id: number, roles: RoleName[]): Promise<PublicUser> {
    const roleNames = [...new Set(roles)];

    if (roleNames.length === 0) {
      throw new ValidationError("At least one role is required", "roles");
    }

    const user = await this.users.findById(id);

    if (!user) {
      throw new NotFoundError("User not found", "USER_NOT_FOUND");
    }

    const roleRows = await this.roles.findByNames(roleNames);

    if (roleRows.length !== roleNames.length) {
      throw new ValidationError("One or more roles are unknown", "roles");
    }

    await this.transactions.transaction((client) =>
      this.roles.replaceUserRoles(
        id,
        roleRows.map((role) => role.id),
        client,
      ),
    );

    return this.getById(id);
  }

  async deactivate(id: number, actorId: number): Promise<PublicUser> {
    return this.update(id, { active: false }, actorId);
  }
}

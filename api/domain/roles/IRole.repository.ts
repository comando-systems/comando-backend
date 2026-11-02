// Persistence contract for roles and the user-role join table.
import type { DbExecutor } from "@/db";
import type { NewRole, Role } from ".";

export interface IRoleRepository {
  findById(id: number, client?: DbExecutor): Promise<Role | undefined>;
  findByName(name: string, client?: DbExecutor): Promise<Role | undefined>;
  findByNames(names: readonly string[], client?: DbExecutor): Promise<Role[]>;
  findAll(client?: DbExecutor): Promise<Role[]>;
  findUserRoles(userId: number, client?: DbExecutor): Promise<Role[]>;
  assignToUser(
    userId: number,
    roleId: number,
    client?: DbExecutor,
  ): Promise<void>;
  replaceUserRoles(
    userId: number,
    roleIds: readonly number[],
    client?: DbExecutor,
  ): Promise<void>;
  ensureDefaults(client?: DbExecutor): Promise<void>;
  create(data: NewRole, client?: DbExecutor): Promise<Role>;
}

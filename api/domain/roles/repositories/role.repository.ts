import { asc, eq, inArray } from "drizzle-orm";
import { db, type DbExecutor } from "@/db";
import { requireRow } from "@/db/helpers";
import { roles, userRoles, type NewRole, type Role } from "@/db/schema/roles";
import { ROLE_NAMES } from "@/domain/roles/permissions";

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

export class RoleRepository implements IRoleRepository {
  async findById(
    id: number,
    client: DbExecutor = db,
  ): Promise<Role | undefined> {
    const [role] = await client
      .select()
      .from(roles)
      .where(eq(roles.id, id));
    return role;
  }

  async findByName(
    name: string,
    client: DbExecutor = db,
  ): Promise<Role | undefined> {
    const [role] = await client
      .select()
      .from(roles)
      .where(eq(roles.name, name));
    return role;
  }

  async findByNames(
    names: readonly string[],
    client: DbExecutor = db,
  ): Promise<Role[]> {
    if (names.length === 0) {
      return [];
    }

    return client
      .select()
      .from(roles)
      .where(inArray(roles.name, [...names]));
  }

  async findAll(client: DbExecutor = db): Promise<Role[]> {
    return client.select().from(roles).orderBy(asc(roles.name));
  }

  async findUserRoles(
    userId: number,
    client: DbExecutor = db,
  ): Promise<Role[]> {
    const result = await client
      .select({ role: roles })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, userId));

    return result.map((row) => row.role);
  }

  async assignToUser(
    userId: number,
    roleId: number,
    client: DbExecutor = db,
  ): Promise<void> {
    await client
      .insert(userRoles)
      .values({ userId, roleId })
      .onConflictDoNothing();
  }

  async replaceUserRoles(
    userId: number,
    roleIds: readonly number[],
    client: DbExecutor = db,
  ): Promise<void> {
    await client.delete(userRoles).where(eq(userRoles.userId, userId));

    if (roleIds.length > 0) {
      await client
        .insert(userRoles)
        .values(roleIds.map((roleId) => ({ userId, roleId })));
    }
  }

  async ensureDefaults(client: DbExecutor = db): Promise<void> {
    await client
      .insert(roles)
      .values(ROLE_NAMES.map((name) => ({ name })))
      .onConflictDoNothing();
  }

  async create(data: NewRole, client: DbExecutor = db): Promise<Role> {
    const [role] = await client.insert(roles).values(data).returning();
    return requireRow(role, "Failed to create role");
  }
}

export const roleRepository = new RoleRepository();

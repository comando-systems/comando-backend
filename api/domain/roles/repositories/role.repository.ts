import { eq } from "drizzle-orm";
import { db } from "@/db";
import { roles, userRoles, type NewRole, type Role } from "@/db/schema/roles";

export interface IRoleRepository {
  findById(id: number): Promise<Role | undefined>;
  findByName(name: string): Promise<Role | undefined>;
  findAll(): Promise<Role[]>;
  findUserRoles(userId: number): Promise<Role[]>;
  assignToUser(userId: number, roleId: number): Promise<void>;
  create(data: NewRole): Promise<Role>;
}

export class RoleRepository implements IRoleRepository {
  async findById(id: number): Promise<Role | undefined> {
    const [role] = await db.select().from(roles).where(eq(roles.id, id));
    return role;
  }

  async findByName(name: string): Promise<Role | undefined> {
    const [role] = await db.select().from(roles).where(eq(roles.name, name));
    return role;
  }

  async findAll(): Promise<Role[]> {
    return db.select().from(roles);
  }

  async findUserRoles(userId: number): Promise<Role[]> {
    const result = await db
      .select({ role: roles })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, userId));

    return result.map((r) => r.role);
  }

  async assignToUser(userId: number, roleId: number): Promise<void> {
    await db.insert(userRoles).values({ userId, roleId }).onConflictDoNothing();
  }

  async create(data: NewRole): Promise<Role> {
    const [role] = await db.insert(roles).values(data).returning();
    return role;
  }
}

export const roleRepository = new RoleRepository();

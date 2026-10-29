import { asc, eq } from "drizzle-orm";
import { db, type DbExecutor } from "@/db";
import { requireRow } from "@/db/helpers";
import { roles, userRoles } from "@/db/schema/roles";
import { users, type NewUser, type User } from "@/db/schema/users";

export interface UserWithRoles {
  user: User;
  roles: string[];
}

export interface IUserRepository {
  findById(id: number, client?: DbExecutor): Promise<User | undefined>;
  findByEmail(email: string, client?: DbExecutor): Promise<User | undefined>;
  findWithRoles(
    id: number,
    client?: DbExecutor,
  ): Promise<UserWithRoles | undefined>;
  findAll(client?: DbExecutor): Promise<User[]>;
  findAllWithRoles(client?: DbExecutor): Promise<UserWithRoles[]>;
  create(data: NewUser, client?: DbExecutor): Promise<User>;
  update(
    id: number,
    data: Partial<NewUser>,
    client?: DbExecutor,
  ): Promise<User | undefined>;
  delete(id: number, client?: DbExecutor): Promise<boolean>;
}

export class UserRepository implements IUserRepository {
  async findById(
    id: number,
    client: DbExecutor = db,
  ): Promise<User | undefined> {
    const [user] = await client
      .select()
      .from(users)
      .where(eq(users.id, id));
    return user;
  }

  async findByEmail(
    email: string,
    client: DbExecutor = db,
  ): Promise<User | undefined> {
    const [user] = await client
      .select()
      .from(users)
      .where(eq(users.email, email));
    return user;
  }

  async findWithRoles(
    id: number,
    client: DbExecutor = db,
  ): Promise<UserWithRoles | undefined> {
    const rows = await client
      .select({ user: users, roleName: roles.name })
      .from(users)
      .leftJoin(userRoles, eq(userRoles.userId, users.id))
      .leftJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(users.id, id));

    const first = rows[0];

    if (!first) {
      return undefined;
    }

    return {
      user: first.user,
      roles: [
        ...new Set(
          rows
            .map((row) => row.roleName)
            .filter((name): name is string => name !== null),
        ),
      ],
    };
  }

  async findAll(client: DbExecutor = db): Promise<User[]> {
    return client.select().from(users).orderBy(asc(users.id));
  }

  async findAllWithRoles(client: DbExecutor = db): Promise<UserWithRoles[]> {
    const rows = await client
      .select({ user: users, roleName: roles.name })
      .from(users)
      .leftJoin(userRoles, eq(userRoles.userId, users.id))
      .leftJoin(roles, eq(roles.id, userRoles.roleId))
      .orderBy(asc(users.id));

    const byUser = new Map<number, UserWithRoles>();

    for (const row of rows) {
      const existing = byUser.get(row.user.id) ?? {
        user: row.user,
        roles: [],
      };

      if (row.roleName !== null && !existing.roles.includes(row.roleName)) {
        existing.roles.push(row.roleName);
      }

      byUser.set(row.user.id, existing);
    }

    return [...byUser.values()];
  }

  async create(data: NewUser, client: DbExecutor = db): Promise<User> {
    const [user] = await client.insert(users).values(data).returning();
    return requireRow(user, "Failed to create user");
  }

  async update(
    id: number,
    data: Partial<NewUser>,
    client: DbExecutor = db,
  ): Promise<User | undefined> {
    const [user] = await client
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async delete(id: number, client: DbExecutor = db): Promise<boolean> {
    const result = await client
      .delete(users)
      .where(eq(users.id, id))
      .returning();
    return result.length > 0;
  }
}

export const userRepository = new UserRepository();

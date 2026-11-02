// Bun SQL implementation of the user repository. All queries accept an
// optional executor so callers can participate in an existing transaction.
import { db, type DbExecutor } from "@/db";
import { requireRow, toNumber } from "@/db/helpers";
import type {
  IUserRepository,
  NewUser,
  User,
  UserWithRoles,
} from "@/domain/users";

type UserRow = Omit<User, "id"> & { id: bigint };
type UserRoleRow = UserRow & { roleName: string | null };

function mapUser(row: UserRow): User {
  return {
    id: toNumber(row.id),
    name: row.name,
    email: row.email,
    passwordHash: row.passwordHash,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// The left joins produce one row per user-role pair; flatten them into one
// UserWithRoles object per user while preserving query order.
function groupUsersWithRoles(rows: readonly UserRoleRow[]): UserWithRoles[] {
  const byUser = new Map<number, UserWithRoles>();

  for (const row of rows) {
    const user = mapUser(row);
    const existing = byUser.get(user.id) ?? { user, roles: [] };

    if (row.roleName !== null && !existing.roles.includes(row.roleName)) {
      existing.roles.push(row.roleName);
    }

    byUser.set(user.id, existing);
  }

  return [...byUser.values()];
}

export class UserRepository implements IUserRepository {
  async findById(
    id: number,
    client: DbExecutor = db,
  ): Promise<User | undefined> {
    const [row] = await client<UserRow[]>`
      select * from users where id = ${id}
    `;
    return row ? mapUser(row) : undefined;
  }

  async findByEmail(
    email: string,
    client: DbExecutor = db,
  ): Promise<User | undefined> {
    const [row] = await client<UserRow[]>`
      select * from users where email = ${email}
    `;
    return row ? mapUser(row) : undefined;
  }

  async findWithRoles(
    id: number,
    client: DbExecutor = db,
  ): Promise<UserWithRoles | undefined> {
    const rows = await client<UserRoleRow[]>`
      select u.*, r.name as role_name
      from users u
      left join user_roles ur on ur.user_id = u.id
      left join roles r on r.id = ur.role_id
      where u.id = ${id}
      order by r.name
    `;

    return groupUsersWithRoles(rows)[0];
  }

  async findAll(client: DbExecutor = db): Promise<User[]> {
    const rows = await client<UserRow[]>`
      select * from users order by id
    `;
    return rows.map(mapUser);
  }

  async findAllWithRoles(client: DbExecutor = db): Promise<UserWithRoles[]> {
    const rows = await client<UserRoleRow[]>`
      select u.*, r.name as role_name
      from users u
      left join user_roles ur on ur.user_id = u.id
      left join roles r on r.id = ur.role_id
      order by u.id, r.name
    `;

    return groupUsersWithRoles(rows);
  }

  async create(data: NewUser, client: DbExecutor = db): Promise<User> {
    const [row] = await client<UserRow[]>`
      insert into users ${client(data)} returning *
    `;
    return mapUser(requireRow(row, "Failed to create user"));
  }

  async update(
    id: number,
    data: Partial<NewUser>,
    client: DbExecutor = db,
  ): Promise<User | undefined> {
    const [row] = await client<UserRow[]>`
      update users
      set ${client({ ...data, updatedAt: new Date() })}
      where id = ${id}
      returning *
    `;
    return row ? mapUser(row) : undefined;
  }

  async delete(id: number, client: DbExecutor = db): Promise<boolean> {
    const rows = await client<{ id: bigint }[]>`
      delete from users where id = ${id} returning id
    `;
    return rows.length > 0;
  }
}

export const userRepository = new UserRepository();

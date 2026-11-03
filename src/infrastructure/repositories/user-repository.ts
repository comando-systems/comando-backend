import { parseRoles, User } from '@/domain/entity/user';
import type {
  UserPage,
  UserPageOptions,
  UserRepository as UserRepositoryContract,
} from '@/domain/repository/user-repository';
import { UserID } from '@/domain/value-objects/ids';
import type { DatabaseConnections } from '@/infrastructure/database/connections';
import { toDate } from '@/infrastructure/repositories/mapping';

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  banned: boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

function mapUser(row: UserRow): User {
  return User.restore({
    id: new UserID(row.id),
    name: row.name,
    email: row.email,
    roles: parseRoles(row.role),
    banned: row.banned,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  });
}

export class UserRepository implements UserRepositoryContract {
  constructor(private readonly database: DatabaseConnections) {}

  async findById(id: UserID): Promise<User | null> {
    const sql = this.database.readSql();
    const rows = await sql<UserRow[]>`
      SELECT id::text AS id, name, email, role, banned, created_at, updated_at
      FROM users
      WHERE id = ${id.value}
    `;

    const row = rows[0];
    return row === undefined ? null : mapUser(row);
  }

  async findByEmail(email: string): Promise<User | null> {
    const sql = this.database.readSql();
    const rows = await sql<UserRow[]>`
      SELECT id::text AS id, name, email, role, banned, created_at, updated_at
      FROM users
      WHERE email = ${email.toLowerCase()}
    `;

    const row = rows[0];
    return row === undefined ? null : mapUser(row);
  }

  async list(options: UserPageOptions): Promise<UserPage> {
    const sql = this.database.readSql();
    const offset = (options.page - 1) * options.pageSize;
    const countRows = await sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS count FROM users
    `;
    const rows = await sql<UserRow[]>`
      SELECT id::text AS id, name, email, role, banned, created_at, updated_at
      FROM users
      ORDER BY id
      LIMIT ${options.pageSize}
      OFFSET ${offset}
    `;

    return {
      users: rows.map(mapUser),
      total: Number(countRows[0]?.count ?? 0),
    };
  }
}

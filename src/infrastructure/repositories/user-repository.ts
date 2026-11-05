import { isRole, User } from '@/domain/entity/user';
import type {
  CreateUserRecord,
  UserPage,
  UserPageOptions,
  UserRepository as UserRepositoryContract,
} from '@/domain/repository/user-repository';
import { UserID } from '@/domain/value-objects/ids';
import type { DatabaseConnections } from '@/infrastructure/database/connections';
import type { SqlClient } from '@/infrastructure/database/sql-client';
import { toDate, toNullableDate } from '@/infrastructure/repositories/mapping';

interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  deleted_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  roles: string[] | null;
}

function mapUser(row: UserRow): User {
  const roles = row.roles ?? [];

  if (!roles.every(isRole)) {
    throw new Error('User has an unsupported role in the database');
  }

  return User.restore({
    id: new UserID(row.id),
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    roles,
    deletedAt: toNullableDate(row.deleted_at),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  });
}

export class UserRepository implements UserRepositoryContract {
  constructor(private readonly database: DatabaseConnections) {}

  async findById(id: UserID): Promise<User | null> {
    const sql = this.database.readSql();
    const rows = await sql.query<UserRow[]>`
      SELECT
        u.id::text AS id,
        u.name,
        u.email,
        u.password_hash,
        u.deleted_at,
        u.created_at,
        u.updated_at,
        COALESCE(
          array_agg(r.code ORDER BY r.code) FILTER (WHERE r.code IS NOT NULL),
          '{}'
        ) AS roles
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id
      WHERE u.id = ${id.value}
      GROUP BY u.id
    `;

    const row = rows[0];
    return row === undefined ? null : mapUser(row);
  }

  async findByEmail(email: string): Promise<User | null> {
    const sql = this.database.readSql();
    const rows = await sql.query<UserRow[]>`
      SELECT
        u.id::text AS id,
        u.name,
        u.email,
        u.password_hash,
        u.deleted_at,
        u.created_at,
        u.updated_at,
        COALESCE(
          array_agg(r.code ORDER BY r.code) FILTER (WHERE r.code IS NOT NULL),
          '{}'
        ) AS roles
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id
      WHERE u.email = ${email.toLowerCase()}
      GROUP BY u.id
    `;

    const row = rows[0];
    return row === undefined ? null : mapUser(row);
  }

  async create(record: CreateUserRecord): Promise<User> {
    const sql = this.database.writeSql();
    const rows = await sql.query<{ id: string }[]>`
      INSERT INTO users (name, email, password_hash, created_at, updated_at)
      VALUES (
        ${record.name},
        ${record.email},
        ${record.passwordHash},
        ${record.now},
        ${record.now}
      )
      RETURNING id::text AS id
    `;

    const id = rows[0]?.id;

    if (id === undefined) {
      throw new Error('Failed to create user');
    }

    const user = User.create({
      id: new UserID(id),
      name: record.name,
      email: record.email,
      passwordHash: record.passwordHash,
      roles: record.roles,
      now: record.now,
    });

    await this.replaceRoles(sql, user);
    return user;
  }

  async update(user: User): Promise<void> {
    const sql = this.database.writeSql();
    await sql.query`
      UPDATE users
      SET
        name = ${user.name},
        email = ${user.email},
        password_hash = ${user.passwordHash},
        deleted_at = ${user.deletedAt},
        updated_at = ${user.updatedAt}
      WHERE id = ${user.id.value}
    `;

    await this.replaceRoles(sql, user);
  }

  async list(options: UserPageOptions): Promise<UserPage> {
    const sql = this.database.readSql();
    const offset = (options.page - 1) * options.pageSize;
    const countRows = await sql.query<{ count: string }[]>`
      SELECT COUNT(*)::text AS count FROM users
    `;
    const rows = await sql.query<UserRow[]>`
      SELECT
        u.id::text AS id,
        u.name,
        u.email,
        u.password_hash,
        u.deleted_at,
        u.created_at,
        u.updated_at,
        COALESCE(
          array_agg(r.code ORDER BY r.code) FILTER (WHERE r.code IS NOT NULL),
          '{}'
        ) AS roles
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id
      GROUP BY u.id
      ORDER BY u.id
      LIMIT ${options.pageSize}
      OFFSET ${offset}
    `;

    return {
      users: rows.map(mapUser),
      total: Number(countRows[0]?.count ?? 0),
    };
  }

  private async replaceRoles(sql: SqlClient, user: User): Promise<void> {
    await sql.query`DELETE FROM user_roles WHERE user_id = ${user.id.value}`;

    for (const role of user.roles) {
      await sql.query`
        INSERT INTO user_roles (user_id, role_id)
        SELECT ${user.id.value}, id FROM roles WHERE code = ${role}
      `;
    }
  }
}

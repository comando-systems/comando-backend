import type { RoleCode } from '@/domain/entity/role';
import { User } from '@/domain/entity/user';
import type { RoleRepository as RoleRepositoryContract } from '@/domain/repository/role-repository';
import type {
  CreateUserRecord,
  UserPage,
  UserPageOptions,
  UserRepository as UserRepositoryContract,
} from '@/domain/repository/user-repository';
import type { UserRoleRepository as UserRoleRepositoryContract } from '@/domain/repository/user-role-repository';
import { RoleID, UserID } from '@/domain/value-objects/ids';
import type { DatabaseConnections } from '@/infrastructure/database/connections';
import { toDate, toNullableDate } from '@/infrastructure/repositories/mapping';

// Arbitrary constant shared by every change that could remove an administrator.
const ADMINISTRATION_LOCK = 7_001;

interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  deleted_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function mapUser(row: UserRow, roles: readonly RoleCode[]): User {
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

/**
 * Persists the `users` table. Role assignments live in `user_roles` and are delegated to the
 * dedicated repositories instead of being written here.
 */
export class UserRepository implements UserRepositoryContract {
  constructor(
    private readonly database: DatabaseConnections,
    private readonly roles: RoleRepositoryContract,
    private readonly userRoles: UserRoleRepositoryContract,
  ) {}

  async findById(id: UserID): Promise<User | null> {
    const rows = await this.database.readSql().query<UserRow[]>`
      SELECT
        id::text AS id,
        name,
        email,
        password_hash,
        deleted_at,
        created_at,
        updated_at
      FROM users
      WHERE id = ${id.value}
    `;

    return this.hydrate(rows[0]);
  }

  async findByEmail(email: string): Promise<User | null> {
    const rows = await this.database.readSql().query<UserRow[]>`
      SELECT
        id::text AS id,
        name,
        email,
        password_hash,
        deleted_at,
        created_at,
        updated_at
      FROM users
      WHERE email = ${email.toLowerCase()}
    `;

    return this.hydrate(rows[0]);
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

    const userId = new UserID(id);
    await this.replaceRoles(userId, record.roles);

    return User.create({
      id: userId,
      name: record.name,
      email: record.email,
      passwordHash: record.passwordHash,
      roles: record.roles,
      now: record.now,
    });
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

    await this.replaceRoles(user.id, user.roles);
  }

  async list(options: UserPageOptions): Promise<UserPage> {
    const sql = this.database.readSql();
    const offset = (options.page - 1) * options.pageSize;
    const countRows = await sql.query<{ count: string }[]>`
      SELECT COUNT(*)::text AS count FROM users
    `;
    const rows = await sql.query<UserRow[]>`
      SELECT
        id::text AS id,
        name,
        email,
        password_hash,
        deleted_at,
        created_at,
        updated_at
      FROM users
      ORDER BY id
      LIMIT ${options.pageSize}
      OFFSET ${offset}
    `;
    const rolesByUser = await this.rolesForUsers(rows.map((row) => new UserID(row.id)));

    return {
      users: rows.map((row) => mapUser(row, rolesByUser.get(row.id) ?? [])),
      total: Number(countRows[0]?.count ?? 0),
    };
  }

  async countActiveAdmins(): Promise<number> {
    return this.userRoles.countActiveAdmins();
  }

  async lockAdministration(): Promise<void> {
    const sql = this.database.writeSql();
    await sql.query`SELECT pg_advisory_xact_lock(${ADMINISTRATION_LOCK}::bigint)`;
  }

  private async hydrate(row: UserRow | undefined): Promise<User | null> {
    if (row === undefined) {
      return null;
    }

    const rolesByUser = await this.rolesForUsers([new UserID(row.id)]);
    return mapUser(row, rolesByUser.get(row.id) ?? []);
  }

  private async rolesForUsers(ids: readonly UserID[]): Promise<Map<string, readonly RoleCode[]>> {
    const assignments = await this.userRoles.findByUserIds(ids);
    const roleIds = [
      ...new Set(
        [...assignments.values()].flatMap((list) =>
          list.map((assignment) => assignment.roleId.value),
        ),
      ),
    ].map((id) => new RoleID(id));
    const roles = await this.roles.findByIds(roleIds);
    const codeByRoleId = new Map(roles.map((role) => [role.id.value, role.code]));

    const result = new Map<string, readonly RoleCode[]>();
    for (const id of ids) {
      const codes = (assignments.get(id.value) ?? [])
        .map((assignment) => codeByRoleId.get(assignment.roleId.value))
        .filter((code): code is RoleCode => code !== undefined)
        .sort();
      result.set(id.value, codes);
    }

    return result;
  }

  private async replaceRoles(userId: UserID, codes: readonly RoleCode[]): Promise<void> {
    const roles = await this.roles.findByCodes(codes);

    if (roles.length !== new Set(codes).size) {
      throw new Error('Failed to resolve user roles');
    }

    await this.userRoles.replaceForUser(
      userId,
      roles.map((role) => role.id),
    );
  }
}

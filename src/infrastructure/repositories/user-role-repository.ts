import { UserRole } from '@/domain/entity/user-role';
import type { UserRoleRepository as UserRoleRepositoryContract } from '@/domain/repository/user-role-repository';
import { RoleID, UserID } from '@/domain/value-objects/ids';
import type { DatabaseConnections } from '@/infrastructure/database/connections';
import { toDate } from '@/infrastructure/repositories/mapping';

interface UserRoleRow {
  user_id: string;
  role_id: string;
  assigned_at: Date | string;
}

function mapUserRole(row: UserRoleRow): UserRole {
  return UserRole.restore({
    userId: new UserID(row.user_id),
    roleId: new RoleID(row.role_id),
    assignedAt: toDate(row.assigned_at),
  });
}

export class UserRoleRepository implements UserRoleRepositoryContract {
  constructor(private readonly database: DatabaseConnections) {}

  async findByUserId(userId: UserID): Promise<readonly UserRole[]> {
    const rows = await this.database.readSql().query<UserRoleRow[]>`
      SELECT user_id::text AS user_id, role_id::text AS role_id, assigned_at
      FROM user_roles
      WHERE user_id = ${userId.value}
      ORDER BY role_id
    `;

    return rows.map(mapUserRole);
  }

  async findByUserIds(
    userIds: readonly UserID[],
  ): Promise<ReadonlyMap<string, readonly UserRole[]>> {
    const grouped = new Map<string, UserRole[]>();
    if (userIds.length === 0) {
      return grouped;
    }

    const rows = await this.database.readSql().unsafe<UserRoleRow[]>(
      `SELECT user_id::text AS user_id, role_id::text AS role_id, assigned_at
      FROM user_roles
      WHERE user_id = ANY(string_to_array($1, ',')::bigint[])
      ORDER BY user_id, role_id`,
      [userIds.map((id) => id.value).join(',')],
    );

    for (const row of rows) {
      const assignments = grouped.get(row.user_id) ?? [];
      assignments.push(mapUserRole(row));
      grouped.set(row.user_id, assignments);
    }

    return grouped;
  }

  async replaceForUser(userId: UserID, roleIds: readonly RoleID[]): Promise<void> {
    const sql = this.database.writeSql();
    await sql.query`DELETE FROM user_roles WHERE user_id = ${userId.value}`;

    for (const roleId of roleIds) {
      await sql.query`
        INSERT INTO user_roles (user_id, role_id)
        VALUES (${userId.value}, ${roleId.value})
      `;
    }
  }

  // Cross-table aggregate for the last-administrator safeguard: joins users and roles to count
  // active administrators in one query.
  async countActiveAdmins(): Promise<number> {
    const rows = await this.database.readSql().query<{ count: string }[]>`
      SELECT COUNT(DISTINCT u.id)::text AS count
      FROM users u
      JOIN user_roles ur ON ur.user_id = u.id
      JOIN roles r ON r.id = ur.role_id
      WHERE r.code = 'ADMIN' AND u.deleted_at IS NULL
    `;

    return Number(rows[0]?.count ?? 0);
  }
}

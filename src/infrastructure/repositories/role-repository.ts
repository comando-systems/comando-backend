import { isRoleCode, Role, type RoleCode } from '@/domain/entity/role';
import type { RoleRepository as RoleRepositoryContract } from '@/domain/repository/role-repository';
import { RoleID } from '@/domain/value-objects/ids';
import type { DatabaseConnections } from '@/infrastructure/database/connections';
import { toDate } from '@/infrastructure/repositories/mapping';

interface RoleRow {
  id: string;
  code: string;
  created_at: Date | string;
}

function mapRole(row: RoleRow): Role {
  if (!isRoleCode(row.code)) {
    throw new Error('Role has an unsupported code in the database');
  }

  return Role.restore({
    id: new RoleID(row.id),
    code: row.code,
    createdAt: toDate(row.created_at),
  });
}

export class RoleRepository implements RoleRepositoryContract {
  constructor(private readonly database: DatabaseConnections) {}

  async findByCodes(codes: readonly RoleCode[]): Promise<readonly Role[]> {
    if (codes.length === 0) {
      return [];
    }

    const rows = await this.database.readSql().unsafe<RoleRow[]>(
      `SELECT id::text AS id, code, created_at
      FROM roles
      WHERE code = ANY(string_to_array($1, ',')::text[])
      ORDER BY code`,
      [codes.join(',')],
    );

    return rows.map(mapRole);
  }

  async findByIds(ids: readonly RoleID[]): Promise<readonly Role[]> {
    if (ids.length === 0) {
      return [];
    }

    const rows = await this.database.readSql().unsafe<RoleRow[]>(
      `SELECT id::text AS id, code, created_at
      FROM roles
      WHERE id = ANY(string_to_array($1, ',')::bigint[])
      ORDER BY code`,
      [ids.map((id) => id.value).join(',')],
    );

    return rows.map(mapRole);
  }
}

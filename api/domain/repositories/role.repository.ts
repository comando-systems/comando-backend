// Bun SQL implementation of the role repository, including idempotent defaults
// and the user-role join table used to support multiple roles per user.
import { db, type DbExecutor } from "@/db";
import { requireRow, toNumber } from "@/db/helpers";
import {
  ROLE_NAMES,
  type IRoleRepository,
  type NewRole,
  type Role,
} from "@/domain/roles";

type RoleRow = Omit<Role, "id"> & { id: bigint };

function mapRole(row: RoleRow): Role {
  return {
    id: toNumber(row.id),
    name: row.name,
    createdAt: row.createdAt,
  };
}

export class RoleRepository implements IRoleRepository {
  async findById(
    id: number,
    client: DbExecutor = db,
  ): Promise<Role | undefined> {
    const [row] = await client<RoleRow[]>`
      select * from roles where id = ${id}
    `;
    return row ? mapRole(row) : undefined;
  }

  async findByName(
    name: string,
    client: DbExecutor = db,
  ): Promise<Role | undefined> {
    const [row] = await client<RoleRow[]>`
      select * from roles where name = ${name}
    `;
    return row ? mapRole(row) : undefined;
  }

  async findByNames(
    names: readonly string[],
    client: DbExecutor = db,
  ): Promise<Role[]> {
    if (names.length === 0) {
      return [];
    }

    const rows = await client<RoleRow[]>`
      select * from roles where name in ${client([...names])}
    `;
    return rows.map(mapRole);
  }

  async findAll(client: DbExecutor = db): Promise<Role[]> {
    const rows = await client<RoleRow[]>`
      select * from roles order by name
    `;
    return rows.map(mapRole);
  }

  async findUserRoles(
    userId: number,
    client: DbExecutor = db,
  ): Promise<Role[]> {
    const rows = await client<RoleRow[]>`
      select r.*
      from roles r
      inner join user_roles ur on ur.role_id = r.id
      where ur.user_id = ${userId}
      order by r.name
    `;
    return rows.map(mapRole);
  }

  async assignToUser(
    userId: number,
    roleId: number,
    client: DbExecutor = db,
  ): Promise<void> {
    await client`
      insert into user_roles (user_id, role_id)
      values (${userId}, ${roleId})
      on conflict do nothing
    `;
  }

  async replaceUserRoles(
    userId: number,
    roleIds: readonly number[],
    client: DbExecutor = db,
  ): Promise<void> {
    await client`delete from user_roles where user_id = ${userId}`;

    if (roleIds.length > 0) {
      await client`
        insert into user_roles ${client(
          roleIds.map((roleId) => ({ userId, roleId })),
        )}
      `;
    }
  }

  // Safe to run repeatedly; existing role names are left untouched.
  async ensureDefaults(client: DbExecutor = db): Promise<void> {
    await client`
      insert into roles ${client(ROLE_NAMES.map((name) => ({ name })))}
      on conflict (name) do nothing
    `;
  }

  async create(data: NewRole, client: DbExecutor = db): Promise<Role> {
    const [row] = await client<RoleRow[]>`
      insert into roles ${client(data)} returning *
    `;
    return mapRole(requireRow(row, "Failed to create role"));
  }
}

export const roleRepository = new RoleRepository();

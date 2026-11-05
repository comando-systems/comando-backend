import { Settings } from '@/domain/entity/settings';
import type { SettingsRepository as SettingsRepositoryContract } from '@/domain/repository/settings-repository';
import { UserID } from '@/domain/value-objects/ids';
import type { DatabaseConnections } from '@/infrastructure/database/connections';
import { toDate } from '@/infrastructure/repositories/mapping';

interface SettingsRow {
  service_fee_enabled: boolean;
  service_fee_basis_points: number;
  updated_by_user_id: string | null;
  updated_at: Date | string;
}

export class SettingsRepository implements SettingsRepositoryContract {
  constructor(private readonly database: DatabaseConnections) {}

  async get(): Promise<Settings> {
    const sql = this.database.readSql();
    const rows = await sql.query<SettingsRow[]>`
      SELECT
        service_fee_enabled,
        service_fee_basis_points,
        updated_by_user_id::text AS updated_by_user_id,
        updated_at
      FROM settings
      WHERE id = 1
    `;

    const row = rows[0];
    if (row === undefined) {
      throw new Error('Settings row is missing; run the migrations');
    }

    return Settings.restore({
      serviceFeeEnabled: row.service_fee_enabled,
      serviceFeeBasisPoints: row.service_fee_basis_points,
      updatedByUserId: row.updated_by_user_id === null ? null : new UserID(row.updated_by_user_id),
      updatedAt: toDate(row.updated_at),
    });
  }

  async save(settings: Settings): Promise<void> {
    const sql = this.database.writeSql();
    await sql.query`
      UPDATE settings
      SET
        service_fee_enabled = ${settings.serviceFeeEnabled},
        service_fee_basis_points = ${settings.serviceFeeBasisPoints},
        updated_by_user_id = ${settings.updatedByUserId?.value ?? null},
        updated_at = ${settings.updatedAt}
      WHERE id = 1
    `;
  }
}

import type { Role, RoleCode } from '@/domain/entity/role';
import type { RoleID } from '@/domain/value-objects/ids';

export interface RoleRepository {
  findByCodes(codes: readonly RoleCode[]): Promise<readonly Role[]>;
  findByIds(ids: readonly RoleID[]): Promise<readonly Role[]>;
}

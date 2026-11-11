import type { UserRole } from '@/domain/entity/user-role';
import type { RoleID, UserID } from '@/domain/value-objects/ids';

export interface UserRoleRepository {
  findByUserId(userId: UserID): Promise<readonly UserRole[]>;
  // One query for a whole page: assignments grouped by user id (users without roles are absent).
  findByUserIds(userIds: readonly UserID[]): Promise<ReadonlyMap<string, readonly UserRole[]>>;
  // Replaces every role of the user with the given set.
  replaceForUser(userId: UserID, roleIds: readonly RoleID[]): Promise<void>;
  countActiveAdmins(): Promise<number>;
}

import { requireValidDate } from '@/domain/entity/validation';
import type { RoleID, UserID } from '@/domain/value-objects/ids';
import { UserRoleKey } from '@/domain/value-objects/user-role-key';

export interface UserRoleProps {
  readonly userId: UserID;
  readonly roleId: RoleID;
  readonly assignedAt: Date;
}

/**
 * Assignment of one role to one user. The row is identified by the pair, so a user cannot hold
 * the same role twice.
 */
export class UserRole {
  private constructor(private readonly props: UserRoleProps) {}

  static restore(props: UserRoleProps): UserRole {
    return new UserRole({
      userId: props.userId,
      roleId: props.roleId,
      assignedAt: requireValidDate(props.assignedAt, 'Assigned at'),
    });
  }

  get key(): UserRoleKey {
    return new UserRoleKey(this.props.userId, this.props.roleId);
  }

  get userId(): UserID {
    return this.props.userId;
  }

  get roleId(): RoleID {
    return this.props.roleId;
  }

  get assignedAt(): Date {
    return new Date(this.props.assignedAt.getTime());
  }
}

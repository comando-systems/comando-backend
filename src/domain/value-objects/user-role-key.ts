import { RoleID, UserID } from '@/domain/value-objects/ids';
import { ValueObject } from '@/domain/value-objects/value-object';

interface UserRoleKeyProps {
  readonly userId: string;
  readonly roleId: string;
}

/**
 * Composite identity of a role assignment: one role per user.
 */
export class UserRoleKey extends ValueObject<UserRoleKeyProps> {
  constructor(userId: UserID, roleId: RoleID) {
    super(Object.freeze({ userId: userId.value, roleId: roleId.value }));
  }

  get userId(): UserID {
    return new UserID(this.props.userId);
  }

  get roleId(): RoleID {
    return new RoleID(this.props.roleId);
  }

  override equals(other: ValueObject<UserRoleKeyProps> | null | undefined): boolean {
    return (
      other instanceof UserRoleKey &&
      this.props.userId === other.props.userId &&
      this.props.roleId === other.props.roleId
    );
  }

  override toString(): string {
    return `${this.props.userId}:${this.props.roleId}`;
  }

  toJSON(): UserRoleKeyProps {
    return { ...this.props };
  }
}

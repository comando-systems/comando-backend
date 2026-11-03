import {
  normalizeEmail,
  requireNonEmptyString,
  requireValidDate,
} from '@/domain/entity/validation';
import { InvalidValueError } from '@/domain/errors';
import type { UserID } from '@/domain/value-objects/ids';

export type Role = 'ADMIN' | 'CASHIER' | 'SERVER';

export const ROLES: readonly Role[] = Object.freeze(['ADMIN', 'CASHIER', 'SERVER']);

export type Permission =
  | 'users:manage'
  | 'items:manage'
  | 'orders:counter'
  | 'orders:history'
  | 'orders:open'
  | 'orders:update'
  | 'orders:cancel'
  | 'orders:close';

const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  ADMIN: ['users:manage', 'items:manage'],
  CASHIER: ['orders:counter', 'orders:history', 'orders:close', 'orders:cancel'],
  SERVER: ['orders:open', 'orders:update', 'orders:close', 'orders:cancel'],
};

export function isRole(value: string): value is Role {
  return ROLES.includes(value as Role);
}

// Better Auth stores multiple roles as one comma-separated string.
export function parseRoles(value: string | null | undefined): Role[] {
  const unique = new Set<Role>();

  for (const part of (value ?? '').split(',')) {
    const code = part.trim();

    if (code === '') {
      continue;
    }
    if (!isRole(code)) {
      throw new InvalidValueError(`Invalid role: ${code}`);
    }
    unique.add(code);
  }

  return [...unique];
}

export function permissionsForRoles(roles: Iterable<Role>): Set<Permission> {
  const permissions = new Set<Permission>();

  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role]) {
      permissions.add(permission);
    }
  }

  return permissions;
}

export interface UserProps {
  readonly id: UserID;
  readonly name: string;
  readonly email: string;
  readonly roles: readonly Role[];
  readonly banned: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// Read model: Better Auth owns user creation, credentials, roles, and bans.
export class User {
  private constructor(private readonly props: UserProps) {}

  static restore(props: UserProps): User {
    const roles = [...new Set(props.roles)];

    if (roles.length === 0) {
      throw new InvalidValueError('At least one role is required');
    }

    return new User({
      id: props.id,
      name: requireNonEmptyString(props.name, 'Name', 160),
      email: normalizeEmail(props.email),
      roles: Object.freeze(roles),
      banned: props.banned,
      createdAt: requireValidDate(props.createdAt, 'Created at'),
      updatedAt: requireValidDate(props.updatedAt, 'Updated at'),
    });
  }

  get id(): UserID {
    return this.props.id;
  }

  get name(): string {
    return this.props.name;
  }

  get email(): string {
    return this.props.email;
  }

  get roles(): readonly Role[] {
    return this.props.roles;
  }

  get createdAt(): Date {
    return new Date(this.props.createdAt.getTime());
  }

  get updatedAt(): Date {
    return new Date(this.props.updatedAt.getTime());
  }

  get isActive(): boolean {
    return !this.props.banned;
  }

  hasRole(role: Role): boolean {
    return this.props.roles.includes(role);
  }

  hasPermission(permission: Permission): boolean {
    return permissionsForRoles(this.props.roles).has(permission);
  }
}

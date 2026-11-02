import {
  normalizeEmail,
  requireNonEmptyString,
  requireValidDate,
} from '@/domain/entity/validation';
import { InvalidValueError, InvariantViolationError } from '@/domain/errors';
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

export function permissionsForRoles(roles: Iterable<Role>): Set<Permission> {
  const permissions = new Set<Permission>();

  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role]) {
      permissions.add(permission);
    }
  }

  return permissions;
}

function normalizeRoles(roles: Iterable<Role>): Role[] {
  const unique = new Set<Role>();

  for (const role of roles) {
    if (!isRole(role)) {
      throw new InvalidValueError(`Invalid role: ${role}`);
    }
    unique.add(role);
  }

  if (unique.size === 0) {
    throw new InvalidValueError('At least one role is required');
  }

  return [...unique];
}

export interface UserProps {
  id: UserID;
  name: string;
  email: string;
  passwordHash: string;
  roles: readonly Role[];
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  readonly id: UserID;
  readonly name: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly roles: readonly Role[];
  readonly now: Date;
}

export interface UpdateUserInput {
  readonly name?: string;
  readonly email?: string;
  readonly roles?: readonly Role[];
  readonly now: Date;
}

export class User {
  private constructor(private readonly props: UserProps) {}

  static create(input: CreateUserInput): User {
    const now = requireValidDate(input.now, 'Now');
    const passwordHash = requireNonEmptyString(input.passwordHash, 'Password hash');

    return new User({
      id: input.id,
      name: requireNonEmptyString(input.name, 'Name', 160),
      email: normalizeEmail(input.email),
      passwordHash,
      roles: Object.freeze(normalizeRoles(input.roles)),
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(props: UserProps): User {
    return new User({
      id: props.id,
      name: requireNonEmptyString(props.name, 'Name', 160),
      email: normalizeEmail(props.email),
      passwordHash: requireNonEmptyString(props.passwordHash, 'Password hash'),
      roles: Object.freeze(normalizeRoles(props.roles)),
      deletedAt: props.deletedAt === null ? null : requireValidDate(props.deletedAt, 'Deleted at'),
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

  get passwordHash(): string {
    return this.props.passwordHash;
  }

  get roles(): readonly Role[] {
    return this.props.roles;
  }

  get deletedAt(): Date | null {
    return this.props.deletedAt === null ? null : new Date(this.props.deletedAt.getTime());
  }

  get createdAt(): Date {
    return new Date(this.props.createdAt.getTime());
  }

  get updatedAt(): Date {
    return new Date(this.props.updatedAt.getTime());
  }

  get isActive(): boolean {
    return this.props.deletedAt === null;
  }

  hasRole(role: Role): boolean {
    return this.props.roles.includes(role);
  }

  hasPermission(permission: Permission): boolean {
    return permissionsForRoles(this.props.roles).has(permission);
  }

  update(input: UpdateUserInput): void {
    const now = requireValidDate(input.now, 'Now');

    if (input.name !== undefined) {
      this.props.name = requireNonEmptyString(input.name, 'Name', 160);
    }

    if (input.email !== undefined) {
      this.props.email = normalizeEmail(input.email);
    }

    if (input.roles !== undefined) {
      this.props.roles = Object.freeze(normalizeRoles(input.roles));
    }

    this.props.updatedAt = now;
  }

  deactivate(now: Date): void {
    if (!this.isActive) {
      throw new InvariantViolationError('User is already deactivated');
    }

    const timestamp = requireValidDate(now, 'Now');
    this.props.deletedAt = timestamp;
    this.props.updatedAt = timestamp;
  }

  changePasswordHash(passwordHash: string, now: Date): void {
    this.props.passwordHash = requireNonEmptyString(passwordHash, 'Password hash');
    this.props.updatedAt = requireValidDate(now, 'Now');
  }
}

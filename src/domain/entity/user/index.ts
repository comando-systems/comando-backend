import {
  isRoleCode,
  type Permission,
  permissionsForRoles,
  type RoleCode,
} from '@/domain/entity/role';
import {
  normalizeEmail,
  requireNonEmptyString,
  requireValidDate,
} from '@/domain/entity/validation';
import { InvalidValueError, InvariantViolationError } from '@/domain/errors';
import type { UserID } from '@/domain/value-objects/ids';

function normalizeRoleCodes(roles: Iterable<RoleCode>): RoleCode[] {
  const unique = new Set<RoleCode>();

  for (const role of roles) {
    if (!isRoleCode(role)) {
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
  roles: readonly RoleCode[];
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  readonly id: UserID;
  readonly name: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly roles: readonly RoleCode[];
  readonly now: Date;
}

export interface UpdateUserInput {
  readonly name?: string;
  readonly email?: string;
  readonly roles?: readonly RoleCode[];
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
      roles: Object.freeze(normalizeRoleCodes(input.roles)),
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
      roles: Object.freeze(normalizeRoleCodes(props.roles)),
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

  get roles(): readonly RoleCode[] {
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

  hasRole(role: RoleCode): boolean {
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
      this.props.roles = Object.freeze(normalizeRoleCodes(input.roles));
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

  activate(now: Date): void {
    if (this.isActive) {
      throw new InvariantViolationError('User is already active');
    }

    this.props.deletedAt = null;
    this.props.updatedAt = requireValidDate(now, 'Now');
  }

  changePasswordHash(passwordHash: string, now: Date): void {
    this.props.passwordHash = requireNonEmptyString(passwordHash, 'Password hash');
    this.props.updatedAt = requireValidDate(now, 'Now');
  }
}

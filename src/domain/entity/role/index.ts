import { requireValidDate } from '@/domain/entity/validation';
import { InvalidValueError } from '@/domain/errors';
import type { RoleID } from '@/domain/value-objects/ids';

export type RoleCode = 'ADMIN' | 'CASHIER' | 'SERVER';

export const ROLE_CODES: readonly RoleCode[] = Object.freeze(['ADMIN', 'CASHIER', 'SERVER']);

export type Permission =
  | 'users:manage'
  | 'items:manage'
  | 'reports:view'
  | 'settings:manage'
  | 'orders:counter'
  | 'orders:history'
  | 'orders:open'
  | 'orders:update'
  | 'orders:request-payment'
  | 'orders:cancel'
  | 'orders:close';

// The table from ADR-02. A server takes the order and hands the table over; the cashier takes the
// payment. Administrators manage the business and may also run the till.
const ROLE_PERMISSIONS: Readonly<Record<RoleCode, readonly Permission[]>> = {
  ADMIN: [
    'users:manage',
    'items:manage',
    'settings:manage',
    'reports:view',
    'orders:counter',
    'orders:history',
    'orders:close',
    'orders:cancel',
  ],
  CASHIER: [
    'orders:counter',
    'orders:history',
    'orders:open',
    'orders:update',
    'orders:request-payment',
    'orders:close',
    'orders:cancel',
  ],
  SERVER: ['orders:open', 'orders:update', 'orders:request-payment', 'orders:cancel'],
};

export function isRoleCode(value: string): value is RoleCode {
  return ROLE_CODES.includes(value as RoleCode);
}

export function permissionsForRoles(roles: Iterable<RoleCode>): Set<Permission> {
  const permissions = new Set<Permission>();

  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role]) {
      permissions.add(permission);
    }
  }

  return permissions;
}

export interface RoleProps {
  readonly id: RoleID;
  readonly code: RoleCode;
  readonly createdAt: Date;
}

export class Role {
  private constructor(private readonly props: RoleProps) {}

  static restore(props: RoleProps): Role {
    if (!isRoleCode(props.code)) {
      throw new InvalidValueError(`Invalid role: ${props.code}`);
    }

    return new Role({
      id: props.id,
      code: props.code,
      createdAt: requireValidDate(props.createdAt, 'Created at'),
    });
  }

  get id(): RoleID {
    return this.props.id;
  }

  get code(): RoleCode {
    return this.props.code;
  }

  get createdAt(): Date {
    return new Date(this.props.createdAt.getTime());
  }
}

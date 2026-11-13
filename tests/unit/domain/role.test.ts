import { describe, expect, test } from 'bun:test';
import {
  isRoleCode,
  permissionsForRoles,
  ROLE_CODES,
  Role,
  type RoleCode,
} from '@/domain/entity/role';
import { InvalidValueError } from '@/domain/errors';
import { RoleID } from '@/domain/value-objects/ids';

const now = new Date('2026-01-01T12:00:00.000Z');

function restore(overrides: Partial<Parameters<typeof Role.restore>[0]> = {}): Role {
  return Role.restore({
    id: new RoleID('1'),
    code: 'ADMIN',
    createdAt: now,
    ...overrides,
  });
}

describe('Role', () => {
  test('exposes its identity and code', () => {
    const role = restore({ code: 'CASHIER' });

    expect(role.id.value).toBe('1');
    expect(role.code).toBe('CASHIER');
    expect(role.createdAt).toEqual(now);
  });

  test('rejects an unsupported code', () => {
    expect(() => restore({ code: 'OWNER' as RoleCode })).toThrow(InvalidValueError);
  });

  test('recognizes the supported role codes', () => {
    expect(ROLE_CODES).toEqual(['ADMIN', 'CASHIER', 'SERVER']);
    expect(isRoleCode('SERVER')).toBe(true);
    expect(isRoleCode('OWNER')).toBe(false);
  });

  test('unions the permissions of several roles', () => {
    expect(permissionsForRoles(['CASHIER', 'SERVER'])).toEqual(
      new Set([
        'orders:counter',
        'orders:history',
        'orders:open',
        'orders:update',
        'orders:request-payment',
        'orders:close',
        'orders:cancel',
      ]),
    );
  });
});

import { describe, expect, test } from 'bun:test';
import { parseRoles, permissionsForRoles, User } from '@/domain/entity/user';
import { InvalidValueError } from '@/domain/errors';
import { UserID } from '@/domain/value-objects/ids';

const now = new Date('2026-01-01T12:00:00.000Z');

function restoreUser(overrides: Partial<Parameters<typeof User.restore>[0]> = {}): User {
  return User.restore({
    id: new UserID('1'),
    name: 'Ada Lovelace',
    email: 'ADA@example.com',
    roles: ['ADMIN'],
    banned: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('parseRoles', () => {
  test('splits the comma-separated storage format and deduplicates', () => {
    expect(parseRoles('CASHIER,SERVER')).toEqual(['CASHIER', 'SERVER']);
    expect(parseRoles(' ADMIN , ADMIN ')).toEqual(['ADMIN']);
  });

  test('returns an empty list for missing values', () => {
    expect(parseRoles(null)).toEqual([]);
    expect(parseRoles(undefined)).toEqual([]);
    expect(parseRoles('')).toEqual([]);
  });

  test('rejects unknown roles', () => {
    expect(() => parseRoles('ADMIN,OWNER')).toThrow(InvalidValueError);
  });
});

describe('User', () => {
  test('normalizes email and deduplicates roles', () => {
    const user = restoreUser({ roles: ['ADMIN', 'ADMIN', 'CASHIER'] });

    expect(user.email).toBe('ada@example.com');
    expect(user.roles).toEqual(['ADMIN', 'CASHIER']);
    expect(user.isActive).toBe(true);
  });

  test('treats banned users as inactive', () => {
    expect(restoreUser({ banned: true }).isActive).toBe(false);
  });

  test('unions permissions from all roles', () => {
    const user = restoreUser({ roles: ['CASHIER', 'SERVER'] });

    expect(user.hasPermission('orders:counter')).toBe(true);
    expect(user.hasPermission('orders:close')).toBe(true);
    expect(user.hasPermission('orders:cancel')).toBe(true);
    expect(user.hasPermission('users:manage')).toBe(false);
    expect(permissionsForRoles(['ADMIN'])).toEqual(new Set(['users:manage', 'items:manage']));
  });

  test('grants closing and cancellation to cashiers and servers', () => {
    expect(permissionsForRoles(['CASHIER'])).toEqual(
      new Set(['orders:counter', 'orders:history', 'orders:close', 'orders:cancel']),
    );
    expect(permissionsForRoles(['SERVER'])).toEqual(
      new Set(['orders:open', 'orders:update', 'orders:close', 'orders:cancel']),
    );
  });

  test('rejects invalid data', () => {
    expect(() => restoreUser({ name: '   ' })).toThrow(InvalidValueError);
    expect(() => restoreUser({ email: 'not-an-email' })).toThrow(InvalidValueError);
    expect(() => restoreUser({ roles: [] })).toThrow(InvalidValueError);
  });
});

import { describe, expect, test } from 'bun:test';
import { permissionsForRoles, User } from '@/domain/entity/user';
import { InvalidValueError, InvariantViolationError } from '@/domain/errors';
import { UserID } from '@/domain/value-objects/ids';

const now = new Date('2026-01-01T12:00:00.000Z');

function createUser(overrides: Partial<Parameters<typeof User.create>[0]> = {}): User {
  return User.create({
    id: new UserID('1'),
    name: 'Ada Lovelace',
    email: 'ADA@example.com',
    passwordHash: 'hash',
    roles: ['ADMIN'],
    now,
    ...overrides,
  });
}

describe('User', () => {
  test('normalizes email and deduplicates roles', () => {
    const user = createUser({ roles: ['ADMIN', 'ADMIN', 'CASHIER'] });

    expect(user.email).toBe('ada@example.com');
    expect(user.roles).toEqual(['ADMIN', 'CASHIER']);
    expect(user.isActive).toBe(true);
  });

  test('unions permissions from all roles', () => {
    const user = createUser({ roles: ['CASHIER', 'SERVER'] });

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
    expect(() => createUser({ name: '   ' })).toThrow(InvalidValueError);
    expect(() => createUser({ email: 'not-an-email' })).toThrow(InvalidValueError);
    expect(() => createUser({ roles: [] })).toThrow(InvalidValueError);
    expect(() => createUser({ passwordHash: '' })).toThrow(InvalidValueError);
  });

  test('updates mutable profile data', () => {
    const user = createUser();
    const later = new Date('2026-01-02T12:00:00.000Z');

    user.update({ name: 'Grace Hopper', roles: ['CASHIER'], now: later });

    expect(user.name).toBe('Grace Hopper');
    expect(user.roles).toEqual(['CASHIER']);
    expect(user.updatedAt).toEqual(later);
  });

  test('deactivates once and preserves history', () => {
    const user = createUser();
    const later = new Date('2026-01-02T12:00:00.000Z');

    user.deactivate(later);

    expect(user.isActive).toBe(false);
    expect(user.deletedAt).toEqual(later);
    expect(() => user.deactivate(later)).toThrow(InvariantViolationError);
  });

  test('changes password hash without exposing plaintext', () => {
    const user = createUser();
    const later = new Date('2026-01-02T12:00:00.000Z');

    user.changePasswordHash('new-hash', later);

    expect(user.passwordHash).toBe('new-hash');
    expect(user.updatedAt).toEqual(later);
  });
});

import { describe, expect, test } from 'bun:test';
import { UserRole } from '@/domain/entity/user-role';
import { InvalidValueError } from '@/domain/errors';
import { RoleID, UserID } from '@/domain/value-objects/ids';
import { UserRoleKey } from '@/domain/value-objects/user-role-key';

const now = new Date('2026-01-01T12:00:00.000Z');

describe('UserRole', () => {
  test('is identified by the user and role pair', () => {
    const assignment = UserRole.restore({
      userId: new UserID('10'),
      roleId: new RoleID('20'),
      assignedAt: now,
    });

    expect(assignment.userId.value).toBe('10');
    expect(assignment.roleId.value).toBe('20');
    expect(assignment.assignedAt).toEqual(now);
    expect(assignment.key.toString()).toBe('10:20');
  });

  test('rejects an invalid assignment date', () => {
    expect(() =>
      UserRole.restore({
        userId: new UserID('10'),
        roleId: new RoleID('20'),
        assignedAt: new Date('not-a-date'),
      }),
    ).toThrow(InvalidValueError);
  });
});

describe('UserRoleKey', () => {
  test('compares both identifiers by value', () => {
    const key = new UserRoleKey(new UserID('10'), new RoleID('20'));

    expect(key.equals(new UserRoleKey(new UserID('10'), new RoleID('20')))).toBe(true);
    expect(key.equals(new UserRoleKey(new UserID('10'), new RoleID('21')))).toBe(false);
    expect(key.equals(new UserRoleKey(new UserID('11'), new RoleID('20')))).toBe(false);
    expect(key.equals(null)).toBe(false);
  });

  test('exposes immutable typed identifiers', () => {
    const key = new UserRoleKey(new UserID('10'), new RoleID('20'));

    expect(key.userId.value).toBe('10');
    expect(key.roleId.value).toBe('20');
    expect(Object.isFrozen(key.value)).toBe(true);
    expect(key.toJSON()).toEqual({ userId: '10', roleId: '20' });
  });
});

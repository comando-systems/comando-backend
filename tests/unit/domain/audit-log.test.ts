import { describe, expect, test } from 'bun:test';
import { AuditLog } from '@/domain/entity/audit-log';
import { InvalidValueError } from '@/domain/errors';
import { AuditLogID, UserID } from '@/domain/value-objects/ids';

const now = new Date('2026-01-01T12:00:00.000Z');

function restore(overrides: Partial<Parameters<typeof AuditLog.restore>[0]> = {}): AuditLog {
  return AuditLog.restore({
    id: new AuditLogID('10'),
    actorUserId: new UserID('1'),
    action: 'item.remove',
    targetType: 'item',
    targetId: '9',
    requestId: 'req-1',
    metadata: { name: 'Coffee' },
    createdAt: now,
    ...overrides,
  });
}

describe('AuditLog', () => {
  test('exposes the recorded event', () => {
    const log = restore();

    expect(log.id.value).toBe('10');
    expect(log.actorUserId?.value).toBe('1');
    expect(log.action).toBe('item.remove');
    expect(log.targetType).toBe('item');
    expect(log.targetId).toBe('9');
    expect(log.requestId).toBe('req-1');
    expect(log.metadata).toEqual({ name: 'Coffee' });
    expect(log.createdAt).toEqual(now);
  });

  test('allows an anonymous actor and a missing target', () => {
    const log = restore({ actorUserId: null, targetId: null, requestId: null });

    expect(log.actorUserId).toBeNull();
    expect(log.targetId).toBeNull();
    expect(log.requestId).toBeNull();
  });

  test('copies and freezes the metadata', () => {
    const metadata = { name: 'Coffee' };
    const log = restore({ metadata });
    metadata.name = 'Tea';

    expect(log.metadata).toEqual({ name: 'Coffee' });
    expect(Object.isFrozen(log.metadata)).toBe(true);
  });

  test('rejects missing action or target type', () => {
    expect(() => restore({ action: '   ' })).toThrow(InvalidValueError);
    expect(() => restore({ targetType: '' })).toThrow(InvalidValueError);
  });
});

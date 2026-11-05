import { describe, expect, test } from 'bun:test';
import { Settings } from '@/domain/entity/settings';
import { InvalidValueError } from '@/domain/errors';
import { UserID } from '@/domain/value-objects/ids';

const now = new Date('2026-01-01T12:00:00.000Z');
const later = new Date('2026-01-02T12:00:00.000Z');

function settings(overrides: Partial<Parameters<typeof Settings.restore>[0]> = {}) {
  return Settings.restore({
    serviceFeeEnabled: true,
    serviceFeeBasisPoints: 1000,
    updatedByUserId: null,
    updatedAt: now,
    ...overrides,
  });
}

describe('Settings', () => {
  test('exposes the fee rate only while the fee is enabled', () => {
    expect(settings().effectiveServiceFeeBasisPoints).toBe(1000);
    expect(settings({ serviceFeeEnabled: false }).effectiveServiceFeeBasisPoints).toBe(0);
    expect(settings({ serviceFeeEnabled: false }).serviceFeeBasisPoints).toBe(1000);
  });

  test('updates the fee and records who changed it', () => {
    const current = settings();

    current.update({
      serviceFeeEnabled: false,
      serviceFeeBasisPoints: 1250,
      byUserId: new UserID('7'),
      now: later,
    });

    expect(current.serviceFeeEnabled).toBe(false);
    expect(current.serviceFeeBasisPoints).toBe(1250);
    expect(current.updatedByUserId?.value).toBe('7');
    expect(current.updatedAt).toEqual(later);
  });

  test('keeps untouched fields when updating only one', () => {
    const current = settings();

    current.update({ serviceFeeBasisPoints: 500, byUserId: new UserID('7'), now: later });

    expect(current.serviceFeeEnabled).toBe(true);
    expect(current.serviceFeeBasisPoints).toBe(500);
  });

  test('rejects rates outside 0 to 100%', () => {
    expect(() => settings({ serviceFeeBasisPoints: 10_001 })).toThrow(InvalidValueError);
    expect(() => settings({ serviceFeeBasisPoints: -1 })).toThrow(InvalidValueError);
    expect(() =>
      settings().update({ serviceFeeBasisPoints: 1.5, byUserId: new UserID('7'), now: later }),
    ).toThrow(InvalidValueError);
  });

  test('protects the date from mutation', () => {
    const current = settings();

    current.updatedAt.setFullYear(1999);

    expect(current.updatedAt).toEqual(now);
  });
});

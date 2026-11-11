import { describe, expect, test } from 'bun:test';
import { RefreshToken } from '@/domain/entity/refresh-token';
import { InvalidValueError } from '@/domain/errors';
import { RefreshTokenID, UserID } from '@/domain/value-objects/ids';

const now = new Date('2026-01-01T12:00:00.000Z');

function restore(
  overrides: Partial<Parameters<typeof RefreshToken.restore>[0]> = {},
): RefreshToken {
  return RefreshToken.restore({
    id: new RefreshTokenID('10'),
    userId: new UserID('1'),
    tokenHash: 'hash',
    expiresAt: new Date(now.getTime() + 60_000),
    revokedAt: null,
    createdAt: now,
    ...overrides,
  });
}

describe('RefreshToken', () => {
  test('tracks expiry and revocation', () => {
    const token = restore();

    expect(token.isExpired(now)).toBe(false);
    expect(token.isExpired(new Date(now.getTime() + 60_000))).toBe(true);
    expect(token.isRevoked).toBe(false);
    expect(restore({ revokedAt: now }).isRevoked).toBe(true);
  });

  test('never exposes mutable dates', () => {
    const token = restore();

    const expiresAt = token.expiresAt;
    expiresAt.setFullYear(2000);

    expect(token.expiresAt).toEqual(new Date(now.getTime() + 60_000));
  });

  test('rejects an empty token hash', () => {
    expect(() => restore({ tokenHash: '   ' })).toThrow(InvalidValueError);
  });
});

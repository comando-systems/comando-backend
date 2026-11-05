import { describe, expect, test } from 'bun:test';
import { UnauthorizedError } from '@/app/errors';
import type { Clock } from '@/app/ports/clock';
import { User } from '@/domain/entity/user';
import { UserID } from '@/domain/value-objects/ids';
import { JwtTokenService } from '@/infrastructure/authentication/jwt-token-service';

class MutableClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current.getTime());
  }

  advance(seconds: number): void {
    this.current = new Date(this.current.getTime() + seconds * 1_000);
  }
}

const now = new Date('2026-01-01T12:00:00.000Z');

function createUser(): User {
  return User.create({
    id: new UserID('7'),
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    passwordHash: 'hash',
    roles: ['CASHIER'],
    now,
  });
}

function createService(
  clock: Clock,
  overrides: Partial<{
    secret: string;
    issuer: string;
    audience: string;
  }> = {},
): JwtTokenService {
  return new JwtTokenService({
    secret: overrides.secret ?? 'a'.repeat(32),
    issuer: overrides.issuer ?? 'comando',
    audience: overrides.audience ?? 'comando-api',
    expiresInSeconds: 900,
    clock,
  });
}

describe('JwtTokenService', () => {
  test('issues a short-lived access token with required claims', async () => {
    const clock = new MutableClock(now);
    const service = createService(clock);

    const issued = await service.issue(createUser());
    const claims = await service.verify(issued.token);

    expect(issued.expiresAt).toEqual(new Date('2026-01-01T12:15:00.000Z'));
    expect(claims.userId).toBe('7');
    expect(claims.tokenId.length).toBeGreaterThan(0);
    expect(claims.issuedAt).toEqual(new Date('2026-01-01T12:00:00.000Z'));
    expect(claims.expiresAt).toEqual(issued.expiresAt);
  });

  test('rejects expired tokens', async () => {
    const clock = new MutableClock(now);
    const service = createService(clock);
    const issued = await service.issue(createUser());

    clock.advance(901);

    await expect(service.verify(issued.token)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  test('rejects tokens with the wrong issuer or audience', async () => {
    const clock = new MutableClock(now);
    const issued = await createService(clock).issue(createUser());

    await expect(
      createService(clock, { issuer: 'other' }).verify(issued.token),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(
      createService(clock, { audience: 'other-api' }).verify(issued.token),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  test('rejects malformed tokens', async () => {
    const clock = new MutableClock(now);
    const service = createService(clock);

    await expect(service.verify('not-a-token')).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

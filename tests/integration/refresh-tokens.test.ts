import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { UnauthorizedError } from '@/app/errors';
import type { Clock } from '@/app/ports/clock';
import {
  DeactivateUserUseCase,
  LoginUseCase,
  LogoutUseCase,
  RefreshSessionUseCase,
  SessionIssuer,
} from '@/app/use-cases';
import type { User } from '@/domain/entity/user';
import type { Repositories } from '@/domain/repository';
import {
  BunPasswordHasher,
  JwtTokenService,
  RandomRefreshTokenCodec,
} from '@/infrastructure/authentication';
import type { DatabaseConnections } from '@/infrastructure/database/connections';
import { DatabaseUnitOfWork } from '@/infrastructure/database/unit-of-work';
import { createRepositories } from '@/infrastructure/repositories';
import { createTestDatabase, resetDatabase, TEST_DATABASE_URL } from './support/database';

const start = new Date('2026-01-01T12:00:00.000Z');
const TTL_SECONDS = 3_600;
const PASSWORD = 'server-password';

class MutableClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current.getTime());
  }

  reset(): void {
    this.current = start;
  }

  advance(seconds: number): void {
    this.current = new Date(this.current.getTime() + seconds * 1_000);
  }
}

describe.skipIf(!TEST_DATABASE_URL)('refresh tokens', () => {
  let database: DatabaseConnections;
  let repositories: Repositories;
  let unitOfWork: DatabaseUnitOfWork;
  let clock: MutableClock;
  let codec: RandomRefreshTokenCodec;
  let login: LoginUseCase;
  let refresh: RefreshSessionUseCase;
  let logout: LogoutUseCase;
  let deactivate: DeactivateUserUseCase;
  let server: User;
  let admin: User;

  beforeAll(() => {
    database = createTestDatabase();
    repositories = createRepositories(database);
    unitOfWork = new DatabaseUnitOfWork(database, () => repositories);
    clock = new MutableClock(start);
    codec = new RandomRefreshTokenCodec();
    const hasher = new BunPasswordHasher();
    const tokenService = new JwtTokenService({
      secret: 'a'.repeat(32),
      issuer: 'comando',
      audience: 'comando-api',
      expiresInSeconds: 900,
      clock,
    });
    const sessions = new SessionIssuer(tokenService, codec, clock, TTL_SECONDS);

    login = new LoginUseCase(unitOfWork, hasher, sessions);
    refresh = new RefreshSessionUseCase(unitOfWork, codec, sessions, clock);
    logout = new LogoutUseCase(unitOfWork, codec, clock);
    deactivate = new DeactivateUserUseCase(unitOfWork, clock);
  });

  beforeEach(async () => {
    await resetDatabase(database);
    clock.reset();
    const hasher = new BunPasswordHasher();
    const create = (name: string, roles: ('ADMIN' | 'SERVER')[]) =>
      unitOfWork.run(async (repos) =>
        repos.users.create({
          name,
          email: `${name}@example.com`,
          passwordHash: await hasher.hash(PASSWORD),
          roles,
          now: start,
        }),
      );
    admin = await create('admin', ['ADMIN']);
    server = await create('server', ['SERVER']);
  });

  afterAll(async () => {
    await database.close();
  });

  const signIn = () => login.execute({ email: 'server@example.com', password: PASSWORD });

  test('stores only the hash of the token and expires it with the configured TTL', async () => {
    const session = await signIn();
    const rows = await database.writeSql().query<{ token_hash: string; expires_at: Date }[]>`
      SELECT token_hash, expires_at FROM refresh_tokens
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0]?.token_hash).toBe(codec.hash(session.refreshToken));
    expect(rows[0]?.token_hash).not.toBe(session.refreshToken);
    expect(session.refreshExpiresAt).toEqual(new Date(start.getTime() + TTL_SECONDS * 1000));
  });

  test('rotates: the old token dies and the new one works', async () => {
    const first = await signIn();
    const second = await refresh.execute({ refreshToken: first.refreshToken });

    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(second.user.id.value).toBe(server.id.value);
    await expect(refresh.execute({ refreshToken: first.refreshToken })).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  test('reusing a rotated token revokes every token of the user', async () => {
    const first = await signIn();
    const other = await signIn();
    const second = await refresh.execute({ refreshToken: first.refreshToken });

    await expect(refresh.execute({ refreshToken: first.refreshToken })).rejects.toBeInstanceOf(
      UnauthorizedError,
    );

    // The revocation committed even though the call failed.
    for (const token of [second.refreshToken, other.refreshToken]) {
      await expect(refresh.execute({ refreshToken: token })).rejects.toBeInstanceOf(
        UnauthorizedError,
      );
    }
  });

  test('rejects unknown and expired tokens', async () => {
    await expect(refresh.execute({ refreshToken: 'nope' })).rejects.toBeInstanceOf(
      UnauthorizedError,
    );

    const session = await signIn();
    clock.advance(TTL_SECONDS);

    await expect(refresh.execute({ refreshToken: session.refreshToken })).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  test('deactivating a user revokes their refresh tokens', async () => {
    const session = await signIn();

    await deactivate.execute({ actorUserId: admin.id, userId: server.id });

    await expect(refresh.execute({ refreshToken: session.refreshToken })).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  test('a deactivated user cannot refresh even if the token was not revoked', async () => {
    const session = await signIn();
    const deactivated = await repositories.users.findById(server.id);
    deactivated?.deactivate(start);
    if (deactivated) await repositories.users.update(deactivated);

    await expect(refresh.execute({ refreshToken: session.refreshToken })).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  test('logout revokes the token and is idempotent', async () => {
    const session = await signIn();

    await logout.execute({ refreshToken: session.refreshToken });
    await logout.execute({ refreshToken: session.refreshToken });
    await logout.execute({ refreshToken: 'unknown' });

    await expect(refresh.execute({ refreshToken: session.refreshToken })).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  test('concurrent refreshes of one token let exactly one succeed', async () => {
    const session = await signIn();
    const results = await Promise.allSettled([
      refresh.execute({ refreshToken: session.refreshToken }),
      refresh.execute({ refreshToken: session.refreshToken }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });
});

import { describe, expect, test } from 'bun:test';
import { UnauthorizedError } from '@/app/errors';
import { LogoutUseCase, RefreshSessionUseCase, SessionIssuer } from '@/app/use-cases';
import type { Repositories } from '@/domain/repository';
import type {
  NewRefreshToken,
  RefreshTokenRecord,
} from '@/domain/repository/refresh-token-repository';
import { UserID } from '@/domain/value-objects/ids';
import { RandomRefreshTokenCodec } from '@/infrastructure/authentication';
import { fakeUnitOfWork, fakeUsers, makeUser, NOW } from '../support/fakes';

const codec = new RandomRefreshTokenCodec();
const clock = { now: () => NOW };
const user = makeUser('1', ['SERVER']);

function world(
  options: { token?: Partial<RefreshTokenRecord> | null; deactivated?: boolean } = {},
) {
  const calls = {
    revoked: [] as string[],
    revokedAll: [] as string[],
    created: [] as NewRefreshToken[],
  };
  const member = options.deactivated === true ? makeUser('1', ['SERVER'], true) : user;
  const record: RefreshTokenRecord | null =
    options.token === null
      ? null
      : {
          id: '10',
          userId: new UserID('1'),
          expiresAt: new Date(NOW.getTime() + 60_000),
          revokedAt: null,
          ...options.token,
        };

  const unitOfWork = fakeUnitOfWork({
    users: fakeUsers({ findById: async () => member }),
    refreshTokens: {
      create: async (token) => {
        calls.created.push(token);
      },
      findByHashForUpdate: async () => record,
      revoke: async (id) => {
        calls.revoked.push(id);
      },
      revokeAllForUser: async (id) => {
        calls.revokedAll.push(id.value);
      },
    },
  } as Partial<Repositories>);
  const sessions = new SessionIssuer(
    {
      issue: async () => ({ token: 'jwt', expiresAt: NOW }),
      verify: async () => {
        throw new Error('unused');
      },
    },
    codec,
    clock,
    3_600,
  );

  return {
    calls,
    refresh: new RefreshSessionUseCase(unitOfWork, codec, sessions, clock),
    logout: new LogoutUseCase(unitOfWork, codec, clock),
  };
}

describe('RefreshSessionUseCase', () => {
  test('rotates a valid token', async () => {
    const { refresh, calls } = world();
    const session = await refresh.execute({ refreshToken: 'any' });

    expect(calls.revoked).toEqual(['10']);
    expect(session.accessToken).toBe('jwt');
    expect(calls.created[0]?.tokenHash).toBe(codec.hash(session.refreshToken));
  });

  test('rejects unknown, expired and deactivated-user tokens', async () => {
    for (const options of [{ token: null }, { token: { expiresAt: NOW } }, { deactivated: true }]) {
      await expect(world(options).refresh.execute({ refreshToken: 'x' })).rejects.toBeInstanceOf(
        UnauthorizedError,
      );
    }
  });

  test('revokes all tokens when a revoked one is presented', async () => {
    const { refresh, calls } = world({ token: { revokedAt: NOW } });

    await expect(refresh.execute({ refreshToken: 'x' })).rejects.toBeInstanceOf(UnauthorizedError);
    expect(calls.revokedAll).toEqual(['1']);
    expect(calls.created).toHaveLength(0);
  });
});

describe('LogoutUseCase', () => {
  test('revokes an active token only once', async () => {
    const active = world();
    await active.logout.execute({ refreshToken: 'x' });
    expect(active.calls.revoked).toEqual(['10']);

    for (const options of [{ token: null }, { token: { revokedAt: NOW } }]) {
      const idle = world(options);
      await idle.logout.execute({ refreshToken: 'x' });
      expect(idle.calls.revoked).toEqual([]);
    }
  });
});

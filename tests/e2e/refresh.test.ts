import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { loadConfig } from '@/app/config';
import { createContainer } from '@/app/container';
import { createApp } from '@/app/http/app';
import type { AppContainer } from '@/app/http/types';
import { resetDatabase, TEST_DATABASE_URL } from '../integration/support/database';

interface Session {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: string;
}

describe.skipIf(!TEST_DATABASE_URL)('refresh tokens over HTTP', () => {
  let container: AppContainer;
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    container = createContainer(
      loadConfig({
        NODE_ENV: 'test',
        DATABASE_READ_URL: TEST_DATABASE_URL,
        DATABASE_WRITE_URL: TEST_DATABASE_URL,
        JWT_SECRET: 'a'.repeat(32),
        LOGIN_RATE_LIMIT_MAX: '1000',
        LOG_LEVEL: 'error',
      }),
    );
    app = createApp(container);
  });

  beforeEach(async () => {
    await resetDatabase(container.database);
    await container.repositories.users.create({
      name: 'Admin',
      email: 'admin@example.com',
      passwordHash: await container.passwordHasher.hash('a-long-enough-password'),
      roles: ['ADMIN'],
      now: new Date(),
    });
  });

  afterAll(async () => {
    await container.close();
  });

  const post = (path: string, body: unknown, token?: string) =>
    app.request(path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify(body),
    });

  async function signIn(): Promise<Session> {
    const response = await post('/auth/login', {
      email: 'admin@example.com',
      password: 'a-long-enough-password',
    });
    return (await response.json()) as Session;
  }

  test('login returns a refresh token that rotates into a working access token', async () => {
    const first = await signIn();
    expect(first.refreshToken.length).toBeGreaterThan(20);

    const response = await post('/auth/refresh', { refreshToken: first.refreshToken });
    const second = (await response.json()) as Session;

    expect(response.status).toBe(200);
    expect(second.refreshToken).not.toBe(first.refreshToken);

    const me = await app.request('/users', {
      headers: { authorization: `Bearer ${second.accessToken}` },
    });
    expect(me.status).toBe(200);
  });

  test('a reused token answers 401 and kills the whole chain', async () => {
    const first = await signIn();
    const second = (await (
      await post('/auth/refresh', { refreshToken: first.refreshToken })
    ).json()) as Session;

    expect((await post('/auth/refresh', { refreshToken: first.refreshToken })).status).toBe(401);
    expect((await post('/auth/refresh', { refreshToken: second.refreshToken })).status).toBe(401);
  });

  test('logout answers 204 without a body and revokes the token', async () => {
    const session = await signIn();
    const response = await post('/auth/logout', { refreshToken: session.refreshToken });

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect((await post('/auth/refresh', { refreshToken: session.refreshToken })).status).toBe(401);
    expect((await post('/auth/logout', { refreshToken: 'unknown' })).status).toBe(204);
  });

  test('rejects a missing refresh token', async () => {
    expect((await post('/auth/refresh', {})).status).toBe(400);
    expect((await post('/auth/logout', {})).status).toBe(400);
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { AppContainer } from '@/app/container';
import { resetDatabase, TEST_DATABASE_URL } from '../integration/support/database';
import { createHarness, PASSWORD } from './support/harness';

interface Session {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: string;
}

const { start, request, createUser } = createHarness();

describe.skipIf(!TEST_DATABASE_URL)('refresh tokens over HTTP', () => {
  let container: AppContainer;

  beforeAll(() => {
    container = start();
  });

  beforeEach(async () => {
    await resetDatabase(container.database);
    await createUser('admin', ['ADMIN']);
  });

  afterAll(async () => {
    await container.close();
  });

  const post = (path: string, body: unknown, token?: string) =>
    request(path, { method: 'POST', body, token });

  async function signIn(): Promise<Session> {
    const response = await post('/auth/login', {
      email: 'admin@example.com',
      password: PASSWORD,
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

    const me = await request('/users', { token: second.accessToken });
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

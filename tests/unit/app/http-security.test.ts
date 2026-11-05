import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { UnauthorizedError } from '@/app/errors';
import { authMiddleware } from '@/app/http/middleware/auth';
import { loginRateLimitMiddleware } from '@/app/http/middleware/login-rate-limit';
import type { AppEnv } from '@/app/http/types';
import type { TokenService } from '@/app/ports/token-service';

const NOW = new Date('2026-01-01T12:00:00.000Z');

function createTokenService(valid = 'good-token'): TokenService {
  return {
    issue: async () => {
      throw new Error('not used');
    },
    verify: async (token) => {
      if (token !== valid) {
        throw new UnauthorizedError('Invalid token');
      }
      return { userId: '7', tokenId: 't', issuedAt: NOW, expiresAt: NOW };
    },
  };
}

function appWith(...middlewares: Array<ReturnType<typeof authMiddleware>>): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  for (const middleware of middlewares) {
    app.use('*', middleware);
  }
  app.get('/', (context) => context.json({ actor: context.get('actorUserId')?.value ?? null }));
  app.onError((error, context) =>
    context.json({ message: error.message }, error instanceof UnauthorizedError ? 401 : 500),
  );
  return app;
}

describe('authMiddleware', () => {
  const app = appWith(authMiddleware(createTokenService()));

  test('sets the actor for a valid bearer token', async () => {
    const response = await app.request('/', { headers: { authorization: 'Bearer good-token' } });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ actor: '7' });
  });

  test.each([
    ['no header', {}],
    ['another scheme', { authorization: 'Basic abc' }],
    ['a token the service rejects', { authorization: 'Bearer bad-token' }],
  ])('answers 401 for %s', async (_label, headers) => {
    const response = await app.request('/', { headers });

    expect(response.status).toBe(401);
  });
});

describe('loginRateLimitMiddleware', () => {
  function limited(maxAttempts: number, windowSeconds = 60) {
    const app = new Hono<AppEnv>();
    app.use('*', loginRateLimitMiddleware({ maxAttempts, windowSeconds }));
    app.post('/', (context) => context.json({ ok: true }));
    app.onError((error, context) => {
      const status = error.name === 'TooManyRequestsError' ? 429 : 500;
      return context.json({ message: error.message }, status);
    });
    return app;
  }

  const from = (client: string) => ({ method: 'POST', headers: { 'x-forwarded-for': client } });

  test('blocks a client after too many attempts and says when to retry', async () => {
    const app = limited(2);

    expect((await app.request('/', from('1.1.1.1'))).status).toBe(200);
    expect((await app.request('/', from('1.1.1.1'))).status).toBe(200);
    const blocked = await app.request('/', from('1.1.1.1'));

    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
  });

  test('counts clients separately, using the first forwarded address', async () => {
    const app = limited(1);

    expect((await app.request('/', from('1.1.1.1, 10.0.0.1'))).status).toBe(200);
    expect((await app.request('/', from('2.2.2.2'))).status).toBe(200);
    expect((await app.request('/', from('1.1.1.1, 10.0.0.9'))).status).toBe(429);
  });

  test('falls back to x-real-ip and then to a shared bucket', async () => {
    const app = limited(1);

    expect(
      (await app.request('/', { method: 'POST', headers: { 'x-real-ip': '3.3.3.3' } })).status,
    ).toBe(200);
    expect(
      (await app.request('/', { method: 'POST', headers: { 'x-real-ip': '3.3.3.3' } })).status,
    ).toBe(429);
    expect((await app.request('/', { method: 'POST' })).status).toBe(200);
    expect((await app.request('/', { method: 'POST' })).status).toBe(429);
  });

  test('lets a client back in once the window has passed', async () => {
    const app = limited(1, 1);
    const realNow = Date.now;
    let clock = realNow();
    Date.now = () => clock;

    try {
      expect((await app.request('/', from('4.4.4.4'))).status).toBe(200);
      expect((await app.request('/', from('4.4.4.4'))).status).toBe(429);

      clock += 1_500;

      expect((await app.request('/', from('4.4.4.4'))).status).toBe(200);
    } finally {
      Date.now = realNow;
    }
  });

  test('drops expired buckets when it tracks too many clients', async () => {
    const app = limited(1, 1);
    const realNow = Date.now;
    let clock = realNow();
    Date.now = () => clock;

    try {
      for (let index = 0; index < 10_000; index += 1) {
        await app.request('/', from(`10.${index % 250}.${Math.floor(index / 250)}.1`));
      }

      clock += 2_000;

      // A new request triggers the cleanup; the old buckets are gone, so a repeat client is fresh.
      expect((await app.request('/', from('10.0.0.1'))).status).toBe(200);
    } finally {
      Date.now = realNow;
    }
  });
});

describe('authMiddleware edge cases', () => {
  // HTTP trims trailing spaces, so an empty token is only reachable by calling the middleware.
  test('rejects a bearer header that carries no token', async () => {
    const middleware = authMiddleware(createTokenService());
    const context = { req: { header: () => 'Bearer    ' } } as unknown as Parameters<
      typeof middleware
    >[0];

    await expect(middleware(context, async () => {})).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

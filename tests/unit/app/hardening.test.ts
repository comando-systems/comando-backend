import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { createApp } from '@/app/http/app';
import { createTestContainer } from '../support/container';

const SECRET_PASSWORD = 'hunter2-very-secret';
const SECRET_TOKEN = 'eyJhbGciOi.secret-bearer.signature';

describe('security headers', () => {
  const app = createApp(createTestContainer());

  test('API responses forbid rendering, framing, and caching', async () => {
    const response = await app.request('/health');

    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('strict-transport-security')).toBeNull();
  });

  test('errors carry the same headers', async () => {
    const response = await app.request('/nope');

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
  });

  test('production adds HSTS', async () => {
    const production = createApp(
      createTestContainer({ NODE_ENV: 'production', CORS_ORIGIN: 'https://app.example.com' }),
    );
    const response = await production.request('/health');

    expect(response.headers.get('strict-transport-security')).toContain('max-age=63072000');
  });

  test('the documentation page keeps working without the API policy', async () => {
    const response = await app.request('/docs');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-security-policy')).toBeNull();
    expect(response.headers.get('cache-control')).toBeNull();
  });
});

describe('CORS origins', () => {
  const app = createApp(
    createTestContainer({
      NODE_ENV: 'production',
      CORS_ORIGIN: 'https://a.example.com, https://b.example.com',
    }),
  );
  const preflight = (origin: string) =>
    app.request('/orders', {
      method: 'OPTIONS',
      headers: { origin, 'access-control-request-method': 'GET' },
    });

  test('allows each listed origin and nobody else', async () => {
    expect(
      (await preflight('https://b.example.com')).headers.get('access-control-allow-origin'),
    ).toBe('https://b.example.com');
    expect(
      (await preflight('https://evil.example.com')).headers.get('access-control-allow-origin'),
    ).toBeNull();
  });
});

describe('logs and errors do not leak secrets', () => {
  const writes: string[] = [];
  const stdout = spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    writes.push(String(chunk));
    return true;
  });
  const stderr = spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    writes.push(String(chunk));
    return true;
  });

  afterEach(() => {
    writes.length = 0;
  });

  test('a failed login and a rejected token never reach the log', async () => {
    const container = createTestContainer({ LOG_LEVEL: 'debug' });
    // Rebuild with a logger that writes, since the shared one is silenced to errors.
    const { JsonLogger } = await import('@/infrastructure/logging/json-logger');
    const app = createApp({ ...container, logger: new JsonLogger('debug') });

    await app.request('/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${SECRET_TOKEN}` },
      body: JSON.stringify({ email: 'x@example.com', password: SECRET_PASSWORD }),
    });
    await app.request('/orders', { headers: { authorization: `Bearer ${SECRET_TOKEN}` } });

    const output = writes.join('');
    expect(output).toContain('request completed');
    expect(output).not.toContain(SECRET_PASSWORD);
    expect(output).not.toContain(SECRET_TOKEN);
  });

  test('an unexpected failure answers a generic 500 and does not echo the cause', async () => {
    const container = createTestContainer();
    const app = createApp({
      ...container,
      database: {
        ...container.database,
        ping: async () => {
          throw new Error('connect ECONNREFUSED postgres://user:db-password@db:5432/comando');
        },
      },
    });

    const response = await app.request('/health/ready');
    const body = JSON.stringify(await response.json());

    expect(response.status).toBe(503);
    expect(body).not.toContain('db-password');
    expect(body).not.toContain('ECONNREFUSED');
    stdout.mockClear();
    stderr.mockClear();
  });
});

import { describe, expect, test } from 'bun:test';
import { loadConfig } from '@/app/config';
import { createApp } from '@/app/http/app';
import type { AppContainer } from '@/app/http/types';
import { JsonLogger } from '@/infrastructure/logging/json-logger';

function createTestContainer(): AppContainer {
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://user:password@localhost:5432/comando',
    JWT_SECRET: 'a'.repeat(32),
    LOG_LEVEL: 'error',
  });

  return {
    config,
    logger: new JsonLogger('error'),
    clock: { now: () => new Date('2026-01-01T00:00:00.000Z') },
    database: {
      sql: {} as AppContainer['database']['sql'],
      async ping() {},
      async close() {},
    },
    async close() {},
  };
}

describe('health endpoints', () => {
  test('returns liveness without exposing configuration', async () => {
    const app = createApp(createTestContainer());
    const response = await app.request('/health');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(response.headers.get('x-request-id')).toBeTruthy();
  });

  test('returns readiness when the database responds', async () => {
    const app = createApp(createTestContainer());
    const response = await app.request('/health/ready');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  test('returns a sanitized 404 for unknown routes', async () => {
    const app = createApp(createTestContainer());
    const response = await app.request('/missing');
    const body = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });
});

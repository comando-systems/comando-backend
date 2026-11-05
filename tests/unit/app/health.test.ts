import { describe, expect, test } from 'bun:test';
import { loadConfig } from '@/app/config';
import { createApp } from '@/app/http/app';
import type { AppContainer } from '@/app/http/types';
import { JsonLogger } from '@/infrastructure/logging/json-logger';
import { createRepositories } from '@/infrastructure/repositories';

function createTestContainer(): AppContainer {
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_READ_URL: 'postgres://user:password@localhost:5432/comando',
    DATABASE_WRITE_URL: 'postgres://user:password@localhost:5432/comando',
    JWT_SECRET: 'a'.repeat(32),
    LOG_LEVEL: 'error',
  });

  const sql = {} as AppContainer['database']['read'];
  const database: AppContainer['database'] = {
    read: sql,
    write: sql,
    readSql: () => sql,
    writeSql: () => sql,
    transaction: async (work) => work(),
    readOnly: async (work) => work(),
    async ping() {},
    async close() {},
  };

  return {
    config,
    logger: new JsonLogger('error'),
    clock: { now: () => new Date('2026-01-01T00:00:00.000Z') },
    database,
    repositories: createRepositories(database),
    unitOfWork: {
      async run() {
        throw new Error('not used by health tests');
      },
      async read() {
        throw new Error('not used by health tests');
      },
    },
    ids: {
      users: { next: async () => '1' },
      items: { next: async () => '1' },
      orders: { next: async () => '1' },
    },
    passwordHasher: {
      hash: async () => 'hash',
      verify: async () => false,
    },
    tokenService: {
      issue: async () => ({ token: 'token', expiresAt: new Date() }),
      verify: async () => {
        throw new Error('not used by health tests');
      },
    },
    useCases: {} as AppContainer['useCases'],
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

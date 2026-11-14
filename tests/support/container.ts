import { loadConfig } from '@/app/config';
import type { AppContainer } from '@/app/container';
import { JsonLogger } from '@/infrastructure/logging/json-logger';
import { createRepositories } from '@/infrastructure/repositories';

export type TestEnvironment = Record<string, string | undefined>;

/** Shared defaults for tests that intentionally construct application configuration. */
export function testEnvironment(overrides: TestEnvironment = {}): TestEnvironment {
  return {
    NODE_ENV: 'test',
    DATABASE_READ_URL: 'postgres://user:password@localhost:5432/comando',
    DATABASE_WRITE_URL: 'postgres://user:password@localhost:5432/comando',
    JWT_SECRET: 'a'.repeat(32),
    LOG_LEVEL: 'error',
    ...overrides,
  };
}

/**
 * Builds a container-shaped test double over fake infrastructure. HTTP tests use this when they
 * need the container interface but no PostgreSQL instance.
 */
export function createTestContainer(environment: TestEnvironment = {}): AppContainer {
  const config = loadConfig(testEnvironment(environment));

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
        throw new Error('not used by this test');
      },
      async read() {
        throw new Error('not used by this test');
      },
    },
    ids: {
      orders: { next: async () => '1' },
    },
    passwordHasher: {
      hash: async () => 'hash',
      verify: async () => false,
    },
    tokenService: {
      issue: async () => ({ token: 'token', expiresAt: new Date() }),
      verify: async () => {
        throw new Error('not used by this test');
      },
    },
    refreshTokenCodec: {
      generate: () => 'refresh-token',
      hash: (token) => `hash:${token}`,
    },
    useCases: {} as AppContainer['useCases'],
    async close() {},
  };
}

import { loadConfig } from '@/app/config';
import { createContainer } from '@/app/container';
import { createApp } from '@/app/http/app';
import type { AppContainer } from '@/app/http/types';
import type { Role } from '@/domain/entity/user';
import { TEST_DATABASE_URL } from '../../integration/support/database';

export const PASSWORD = 'a-long-enough-password';

export interface RequestOptions {
  readonly method?: string;
  readonly token?: string;
  readonly body?: unknown;
}

// One API instance over the test database, shared by the e2e suites so each only holds its
// scenario. `start` must run in `beforeAll`; the helpers fail loudly if it did not.
export function createHarness() {
  let app: ReturnType<typeof createApp> | undefined;
  let container: AppContainer | undefined;

  function start(environment: Record<string, string> = {}): AppContainer {
    container = createContainer(
      loadConfig({
        NODE_ENV: 'test',
        DATABASE_READ_URL: TEST_DATABASE_URL,
        DATABASE_WRITE_URL: TEST_DATABASE_URL,
        JWT_SECRET: 'a'.repeat(32),
        LOGIN_RATE_LIMIT_MAX: '1000',
        LOG_LEVEL: 'error',
        ...environment,
      }),
    );
    app = createApp(container);
    return container;
  }

  async function request(path: string, options: RequestOptions = {}): Promise<Response> {
    if (app === undefined) {
      throw new Error('Call start() in beforeAll first');
    }

    const headers: Record<string, string> = {};
    if (options.token !== undefined) headers.authorization = `Bearer ${options.token}`;
    if (options.body !== undefined) headers['content-type'] = 'application/json';

    return app.request(path, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  }

  async function createUser(name: string, roles: Role[]): Promise<string> {
    if (container === undefined) {
      throw new Error('Call start() in beforeAll first');
    }

    const user = await container.repositories.users.create({
      name,
      email: `${name}@example.com`,
      passwordHash: await container.passwordHasher.hash(PASSWORD),
      roles,
      now: new Date(),
    });
    return user.id.value;
  }

  async function login(name: string, password = PASSWORD): Promise<string> {
    const response = await request('/auth/login', {
      method: 'POST',
      body: { email: `${name}@example.com`, password },
    });
    return ((await response.json()) as { accessToken: string }).accessToken;
  }

  return { start, request, createUser, login };
}

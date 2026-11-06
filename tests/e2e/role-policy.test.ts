import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { loadConfig } from '@/app/config';
import { createContainer } from '@/app/container';
import { createApp } from '@/app/http/app';
import type { AppContainer } from '@/app/http/types';
import type { Role } from '@/domain/entity/user';
import { resetDatabase, TEST_DATABASE_URL } from '../integration/support/database';

type Actor = 'ADMIN' | 'CASHIER' | 'SERVER';

const PASSWORD = 'a-long-enough-password';

// The table from ADR-02, as seen from the HTTP API.
const POLICY: ReadonlyArray<{ operation: string; ADMIN: number; CASHIER: number; SERVER: number }> =
  [
    { operation: 'open a table', ADMIN: 403, CASHIER: 201, SERVER: 201 },
    { operation: 'add items', ADMIN: 403, CASHIER: 200, SERVER: 200 },
    { operation: 'change a quantity', ADMIN: 403, CASHIER: 200, SERVER: 200 },
    { operation: 'remove a line', ADMIN: 403, CASHIER: 200, SERVER: 200 },
    { operation: 'set the pricing', ADMIN: 200, CASHIER: 200, SERVER: 200 },
    { operation: 'request payment', ADMIN: 403, CASHIER: 200, SERVER: 200 },
    { operation: 'close', ADMIN: 200, CASHIER: 200, SERVER: 403 },
    { operation: 'cancel', ADMIN: 200, CASHIER: 200, SERVER: 200 },
    { operation: 'create a counter order', ADMIN: 201, CASHIER: 201, SERVER: 403 },
    { operation: 'list the history', ADMIN: 200, CASHIER: 200, SERVER: 403 },
    { operation: 'read a closed order', ADMIN: 200, CASHIER: 200, SERVER: 403 },
  ];

describe.skipIf(!TEST_DATABASE_URL)('role policy over HTTP', () => {
  let container: AppContainer;
  let app: ReturnType<typeof createApp>;
  let tokens: Record<Actor, string>;
  let itemId: string;
  let tableNumber = 0;

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
    tableNumber = 0;

    for (const role of ['ADMIN', 'CASHIER', 'SERVER'] as Role[]) {
      await container.repositories.users.create({
        name: role,
        email: `${role.toLowerCase()}@example.com`,
        passwordHash: await container.passwordHasher.hash(PASSWORD),
        roles: [role],
        now: new Date(),
      });
    }

    tokens = {
      ADMIN: await login('admin'),
      CASHIER: await login('cashier'),
      SERVER: await login('server'),
    };

    const item = await request('/items', {
      method: 'POST',
      token: tokens.ADMIN,
      body: { name: 'Coffee', priceCents: 1000 },
    });
    itemId = ((await item.json()) as { id: string }).id;
  });

  afterAll(async () => {
    await container.close();
  });

  async function login(name: string): Promise<string> {
    const response = await request('/auth/login', {
      method: 'POST',
      body: { email: `${name}@example.com`, password: PASSWORD },
    });
    return ((await response.json()) as { accessToken: string }).accessToken;
  }

  async function request(
    path: string,
    options: { method?: string; token?: string; body?: unknown } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = {};
    if (options.token !== undefined) headers.authorization = `Bearer ${options.token}`;
    if (options.body !== undefined) headers['content-type'] = 'application/json';

    return app.request(path, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  }

  // A server opens a table with one coffee on it, so every probe starts from a known order.
  async function openTableWithCoffee(): Promise<string> {
    tableNumber += 1;
    const opened = await request('/orders/table', {
      method: 'POST',
      token: tokens.SERVER,
      body: { tableCode: `T-${tableNumber}` },
    });
    const { id } = (await opened.json()) as { id: string };
    await request(`/orders/${id}/items`, {
      method: 'POST',
      token: tokens.SERVER,
      body: { items: [{ itemId, quantity: 1 }] },
    });
    return id;
  }

  // Runs one operation as the given actor against a fresh order and returns the status.
  async function attempt(operation: string, actor: Actor): Promise<number> {
    const token = tokens[actor];

    switch (operation) {
      case 'open a table':
        return (
          await request('/orders/table', {
            method: 'POST',
            token,
            body: { tableCode: `PROBE-${actor}` },
          })
        ).status;
      case 'add items': {
        const id = await openTableWithCoffee();
        return (
          await request(`/orders/${id}/items`, {
            method: 'POST',
            token,
            body: { items: [{ itemId, quantity: 1 }] },
          })
        ).status;
      }
      case 'change a quantity': {
        const id = await openTableWithCoffee();
        return (
          await request(`/orders/${id}/items/${itemId}`, {
            method: 'PATCH',
            token,
            body: { quantity: 3 },
          })
        ).status;
      }
      case 'remove a line': {
        const id = await openTableWithCoffee();
        return (await request(`/orders/${id}/items/${itemId}`, { method: 'DELETE', token })).status;
      }
      case 'set the pricing': {
        const id = await openTableWithCoffee();
        return (
          await request(`/orders/${id}/pricing`, {
            method: 'PATCH',
            token,
            body: { applyServiceFee: false },
          })
        ).status;
      }
      case 'request payment': {
        const id = await openTableWithCoffee();
        return (await request(`/orders/${id}/request-payment`, { method: 'POST', token })).status;
      }
      case 'close': {
        const id = await openTableWithCoffee();
        return (
          await request(`/orders/${id}/close`, {
            method: 'POST',
            token,
            body: { payments: [{ method: 'PIX', amountCents: 1000 }] },
          })
        ).status;
      }
      case 'cancel': {
        const id = await openTableWithCoffee();
        return (await request(`/orders/${id}/cancel`, { method: 'POST', token })).status;
      }
      case 'create a counter order':
        return (
          await request('/orders/counter', {
            method: 'POST',
            token,
            body: {
              items: [{ itemId, quantity: 1 }],
              payments: [{ method: 'PIX', amountCents: 1000 }],
            },
          })
        ).status;
      case 'list the history':
        return (await request('/orders?status=CLOSED', { token })).status;
      case 'read a closed order': {
        const id = await openTableWithCoffee();
        await request(`/orders/${id}/close`, {
          method: 'POST',
          token: tokens.CASHIER,
          body: { payments: [{ method: 'PIX', amountCents: 1000 }] },
        });
        return (await request(`/orders/${id}`, { token })).status;
      }
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }

  for (const row of POLICY) {
    for (const actor of ['ADMIN', 'CASHIER', 'SERVER'] as Actor[]) {
      test(`${actor} ${row[actor] >= 400 ? 'cannot' : 'can'} ${row.operation} (${row[actor]})`, async () => {
        expect(await attempt(row.operation, actor)).toBe(row[actor]);
      });
    }
  }

  test('a server can still follow a live order, but not the history', async () => {
    const id = await openTableWithCoffee();

    expect((await request(`/orders/${id}`, { token: tokens.SERVER })).status).toBe(200);
    expect(
      (await request('/orders?statuses=OPEN,AWAITING_PAYMENT', { token: tokens.SERVER })).status,
    ).toBe(200);
    expect((await request('/orders', { token: tokens.SERVER })).status).toBe(403);
  });
});

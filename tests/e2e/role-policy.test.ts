import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { AppContainer } from '@/app/http/types';
import type { RoleCode } from '@/domain/entity/role';
import { resetDatabase, TEST_DATABASE_URL } from '../integration/support/database';
import { createHarness } from './support/harness';

type Actor = 'ADMIN' | 'CASHIER' | 'SERVER';

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

const { start, request, createUser, login } = createHarness();

describe.skipIf(!TEST_DATABASE_URL)('role policy over HTTP', () => {
  let container: AppContainer;
  let tokens: Record<Actor, string>;
  let itemId: string;
  let tableNumber = 0;

  beforeAll(() => {
    container = start();
  });

  beforeEach(async () => {
    await resetDatabase(container.database);
    tableNumber = 0;

    for (const role of ['ADMIN', 'CASHIER', 'SERVER'] as RoleCode[]) {
      await createUser(role.toLowerCase(), [role]);
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

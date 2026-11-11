import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { AppContainer } from '@/app/http/types';
import type { RoleCode } from '@/domain/entity/role';
import { resetDatabase, TEST_DATABASE_URL } from '../integration/support/database';
import { createHarness } from './support/harness';

interface SummaryDto {
  from: string;
  to: string;
  closedOrders: number;
  revenueCents: number;
  averageTicketCents: number;
  canceledOrders: number;
  openOrders: number;
  byMethod: Array<{ method: string; amountCents: number }>;
}

const HOUR_MS = 60 * 60 * 1000;

const { start, request, createUser, login } = createHarness();

describe.skipIf(!TEST_DATABASE_URL)('sales summary API', () => {
  let container: AppContainer;
  let adminToken: string;
  let cashierToken: string;
  let serverToken: string;
  let itemId: string;

  beforeAll(() => {
    container = start();
  });

  beforeEach(async () => {
    await resetDatabase(container.database);
    for (const [name, roles] of [
      ['admin', ['ADMIN']],
      ['cashier', ['CASHIER']],
      ['server', ['SERVER']],
    ] as Array<[string, RoleCode[]]>) {
      await createUser(name, roles);
    }
    adminToken = await login('admin');
    cashierToken = await login('cashier');
    serverToken = await login('server');

    const item = await request('/items', {
      method: 'POST',
      token: adminToken,
      body: { name: 'Coffee', priceCents: 1000 },
    });
    itemId = ((await item.json()) as { id: string }).id;
  });

  afterAll(async () => {
    await container.close();
  });

  async function counterSale(
    quantity: number,
    payments: Array<{ method: string; amountCents: number }>,
  ): Promise<void> {
    const response = await request('/orders/counter', {
      method: 'POST',
      token: cashierToken,
      body: { items: [{ itemId, quantity }], payments },
    });
    expect(response.status).toBe(201);
  }

  async function openTable(tableCode: string): Promise<string> {
    const response = await request('/orders/table', {
      method: 'POST',
      token: serverToken,
      body: { tableCode },
    });
    return ((await response.json()) as { id: string }).id;
  }

  const window = () => {
    const now = Date.now();
    const from = new Date(now - HOUR_MS).toISOString();
    const to = new Date(now + HOUR_MS).toISOString();
    return `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  };

  const summary = async (query: string): Promise<SummaryDto> =>
    (await (
      await request(`/reports/summary?${query}`, { token: adminToken })
    ).json()) as SummaryDto;

  test('adds up the closed orders and the payments by method', async () => {
    await counterSale(2, [
      { method: 'CASH', amountCents: 500 },
      { method: 'PIX', amountCents: 1500 },
    ]);
    await counterSale(1, [{ method: 'CASH', amountCents: 1000 }]);

    const result = await summary(window());

    expect(result).toMatchObject({
      closedOrders: 2,
      revenueCents: 3000,
      averageTicketCents: 1500,
      canceledOrders: 0,
      openOrders: 0,
    });
    expect(result.byMethod).toEqual([
      { method: 'CASH', amountCents: 1500 },
      { method: 'PIX', amountCents: 1500 },
    ]);
  });

  test('counts canceled orders and the ones still being served separately', async () => {
    await counterSale(1, [{ method: 'PIX', amountCents: 1000 }]);
    const canceled = await openTable('T-1');
    await request(`/orders/${canceled}/cancel`, { method: 'POST', token: cashierToken });
    await openTable('T-2');
    const waiting = await openTable('T-3');
    await request(`/orders/${waiting}/items`, {
      method: 'POST',
      token: serverToken,
      body: { items: [{ itemId, quantity: 1 }] },
    });
    await request(`/orders/${waiting}/request-payment`, { method: 'POST', token: serverToken });

    const result = await summary(window());

    expect(result).toMatchObject({ closedOrders: 1, canceledOrders: 1, openOrders: 2 });
  });

  test('reports the orders closed in the range, not the ones around it', async () => {
    await counterSale(1, [{ method: 'CASH', amountCents: 1000 }]);
    const past = `from=${encodeURIComponent(new Date(Date.now() - 48 * HOUR_MS).toISOString())}&to=${encodeURIComponent(new Date(Date.now() - 24 * HOUR_MS).toISOString())}`;
    const future = `from=${encodeURIComponent(new Date(Date.now() + 24 * HOUR_MS).toISOString())}&to=${encodeURIComponent(new Date(Date.now() + 48 * HOUR_MS).toISOString())}`;

    for (const query of [past, future]) {
      const result = await summary(query);

      expect(result).toMatchObject({
        closedOrders: 0,
        revenueCents: 0,
        averageTicketCents: 0,
        byMethod: [],
      });
    }
  });

  test('with no parameters it answers for one day', async () => {
    const result = await summary('');

    expect(new Date(result.to).getTime() - new Date(result.from).getTime()).toBe(24 * HOUR_MS);
    expect(result.closedOrders).toBeGreaterThanOrEqual(0);
  });

  test('only administrators may read it', async () => {
    for (const token of [cashierToken, serverToken]) {
      expect((await request('/reports/summary', { token })).status).toBe(403);
    }
    expect((await request('/reports/summary')).status).toBe(401);
  });

  test.each([
    ['an inverted range', 'from=2026-03-02T00:00:00Z&to=2026-03-01T00:00:00Z'],
    ['a range longer than a year', 'from=2025-01-01T00:00:00Z&to=2026-03-01T00:00:00Z'],
    ['a date that is not a date', 'from=yesterday'],
  ])('rejects %s', async (_label, query) => {
    const response = await request(`/reports/summary?${query}`, { token: adminToken });

    expect(response.status).toBe(400);
  });
});

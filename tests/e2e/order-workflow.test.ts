import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { loadConfig } from '@/app/config';
import { createContainer } from '@/app/container';
import { createApp } from '@/app/http/app';
import type { AppContainer } from '@/app/http/types';
import type { Role } from '@/domain/entity/user';
import { UserID } from '@/domain/value-objects/ids';
import { resetDatabase, TEST_DATABASE_URL } from '../integration/support/database';

interface OrderDto {
  id: string;
  type: string;
  status: string;
  tableCode: string | null;
  label: string | null;
  version: number;
  paymentRequestedAt: string | null;
  paymentRequestedByUserId: string | null;
  adjustment: { type: string; mode: string; value: number } | null;
  applyServiceFee: boolean;
  serviceFeeBasisPoints: number;
  subtotalCents: number;
  adjustmentCents: number;
  serviceFeeCents: number;
  totalCents: number;
  items: Array<{ itemId: string; quantity: number }>;
  payments: Array<{
    method: string;
    amountCents: number;
    receivedCents: number | null;
    changeCents: number | null;
  }>;
}

interface ErrorDto {
  error: { code: string; message: string; details?: { orderId?: string } };
}

interface PageDto<T> {
  data: T[];
  pagination: { total: number };
}

const PASSWORD = 'a-long-enough-password';

describe.skipIf(!TEST_DATABASE_URL)('order workflow API', () => {
  let container: AppContainer;
  let app: ReturnType<typeof createApp>;
  let adminId: string;
  let adminToken: string;
  let serverToken: string;
  let cashierToken: string;
  let itemId: string;

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
    adminId = await createUser('admin', ['ADMIN']);
    await createUser('cashier', ['CASHIER']);
    await createUser('server', ['SERVER']);
    adminToken = await login('admin');
    cashierToken = await login('cashier');
    serverToken = await login('server');

    const item = await request('/items', {
      method: 'POST',
      token: adminToken,
      body: { name: 'Coffee', priceCents: 1000 },
    });
    expect(item.status).toBe(201);
    itemId = ((await item.json()) as { id: string }).id;
  });

  afterAll(async () => {
    await container.close();
  });

  async function createUser(name: string, roles: Role[]): Promise<string> {
    const user = await container.repositories.users.create({
      name,
      email: `${name}@example.com`,
      passwordHash: await container.passwordHasher.hash(PASSWORD),
      roles,
      now: new Date(),
    });
    return user.id.value;
  }

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

  const json = async <T>(response: Response): Promise<T> => (await response.json()) as T;

  async function openTable(tableCode = 'T-1'): Promise<OrderDto> {
    const response = await request('/orders/table', {
      method: 'POST',
      token: serverToken,
      body: { tableCode },
    });
    expect(response.status).toBe(201);
    return json<OrderDto>(response);
  }

  async function addCoffee(orderId: string, quantity: number): Promise<OrderDto> {
    const response = await request(`/orders/${orderId}/items`, {
      method: 'POST',
      token: serverToken,
      body: { items: [{ itemId, quantity }] },
    });
    expect(response.status).toBe(200);
    return json<OrderDto>(response);
  }

  async function enableServiceFee(basisPoints = 1000): Promise<void> {
    await container.unitOfWork.run(async (repositories) => {
      const settings = await repositories.settings.get();
      settings.update({
        serviceFeeEnabled: true,
        serviceFeeBasisPoints: basisPoints,
        byUserId: new UserID(adminId),
        now: new Date(),
      });
      await repositories.settings.save(settings);
    });
  }

  describe('handing a table to the cashier', () => {
    test('the server asks for payment, the cashier closes the bill', async () => {
      const order = await openTable();
      await addCoffee(order.id, 2);

      const requested = await request(`/orders/${order.id}/request-payment`, {
        method: 'POST',
        token: serverToken,
      });
      const waiting = await json<OrderDto>(requested);

      expect(requested.status).toBe(200);
      expect(waiting.status).toBe('AWAITING_PAYMENT');
      expect(waiting.paymentRequestedAt).not.toBeNull();
      expect(waiting.version).toBeGreaterThan(order.version);

      const closed = await request(`/orders/${order.id}/close`, {
        method: 'POST',
        token: cashierToken,
        body: { payments: [{ method: 'PIX', amountCents: 2000 }] },
      });

      expect(closed.status).toBe(200);
      expect((await json<OrderDto>(closed)).status).toBe('CLOSED');
    });

    test('the lines are locked while the table awaits payment, until it is reopened', async () => {
      const order = await openTable();
      await addCoffee(order.id, 1);
      await request(`/orders/${order.id}/request-payment`, { method: 'POST', token: serverToken });

      const locked = await request(`/orders/${order.id}/items`, {
        method: 'POST',
        token: serverToken,
        body: { items: [{ itemId, quantity: 1 }] },
      });
      expect(locked.status).toBe(409);

      const reopened = await request(`/orders/${order.id}/reopen`, {
        method: 'POST',
        token: cashierToken,
      });
      const open = await json<OrderDto>(reopened);
      expect(open.status).toBe('OPEN');
      expect(open.paymentRequestedAt).toBeNull();

      expect((await addCoffee(order.id, 1)).items[0]?.quantity).toBe(2);
    });

    test('an empty order cannot be handed over, and a closed one cannot be reopened', async () => {
      const order = await openTable();

      const empty = await request(`/orders/${order.id}/request-payment`, {
        method: 'POST',
        token: serverToken,
      });
      expect(empty.status).toBe(409);

      const notWaiting = await request(`/orders/${order.id}/reopen`, {
        method: 'POST',
        token: cashierToken,
      });
      expect(notWaiting.status).toBe(409);
    });

    test('an administrator can neither hand over nor reopen', async () => {
      const order = await openTable();
      await addCoffee(order.id, 1);

      for (const path of ['request-payment', 'reopen']) {
        const response = await request(`/orders/${order.id}/${path}`, {
          method: 'POST',
          token: adminToken,
        });
        expect(response.status).toBe(403);
      }
    });

    test('needs a token', async () => {
      expect((await request('/orders/1/request-payment', { method: 'POST' })).status).toBe(401);
      expect((await request('/orders/1/reopen', { method: 'POST' })).status).toBe(401);
    });
  });

  describe('pricing', () => {
    test('applies a discount and clears it again', async () => {
      const order = await openTable();
      await addCoffee(order.id, 2);

      const discounted = await json<OrderDto>(
        await request(`/orders/${order.id}/pricing`, {
          method: 'PATCH',
          token: cashierToken,
          body: { adjustment: { type: 'DISCOUNT', mode: 'PERCENT', value: 1000 } },
        }),
      );
      expect(discounted).toMatchObject({
        subtotalCents: 2000,
        adjustmentCents: -200,
        totalCents: 1800,
      });
      expect(discounted.adjustment).toEqual({ type: 'DISCOUNT', mode: 'PERCENT', value: 1000 });

      const cleared = await json<OrderDto>(
        await request(`/orders/${order.id}/pricing`, {
          method: 'PATCH',
          token: serverToken,
          body: { adjustment: null },
        }),
      );
      expect(cleared).toMatchObject({ adjustmentCents: 0, totalCents: 2000, adjustment: null });
    });

    test('can still be adjusted while awaiting payment', async () => {
      const order = await openTable();
      await addCoffee(order.id, 1);
      await request(`/orders/${order.id}/request-payment`, { method: 'POST', token: serverToken });

      const response = await request(`/orders/${order.id}/pricing`, {
        method: 'PATCH',
        token: cashierToken,
        body: { adjustment: { type: 'SURCHARGE', mode: 'FIXED', value: 150 } },
      });

      expect((await json<OrderDto>(response)).totalCents).toBe(1150);
    });

    test('charges the service fee at the rate in the settings', async () => {
      await enableServiceFee(1000);
      const order = await openTable();
      await addCoffee(order.id, 2);

      const open = await json<OrderDto>(
        await request(`/orders/${order.id}`, { token: cashierToken }),
      );
      expect(open).toMatchObject({
        applyServiceFee: true,
        serviceFeeBasisPoints: 1000,
        serviceFeeCents: 200,
        totalCents: 2200,
      });

      const off = await json<OrderDto>(
        await request(`/orders/${order.id}/pricing`, {
          method: 'PATCH',
          token: serverToken,
          body: { applyServiceFee: false },
        }),
      );
      expect(off).toMatchObject({ applyServiceFee: false, serviceFeeCents: 0, totalCents: 2000 });
    });

    test('a table opened while the fee is off charges none', async () => {
      const order = await openTable();
      const priced = await addCoffee(order.id, 2);

      expect(priced.serviceFeeCents).toBe(0);
      expect(priced.totalCents).toBe(2000);
    });

    test.each([
      ['an empty body', {}],
      [
        'a percentage above 100%',
        { adjustment: { type: 'DISCOUNT', mode: 'PERCENT', value: 20_000 } },
      ],
      ['a negative value', { adjustment: { type: 'DISCOUNT', mode: 'FIXED', value: -1 } }],
      ['an unknown type', { adjustment: { type: 'BONUS', mode: 'FIXED', value: 1 } }],
    ])('rejects %s', async (_label, body) => {
      const order = await openTable();
      await addCoffee(order.id, 1);

      const response = await request(`/orders/${order.id}/pricing`, {
        method: 'PATCH',
        token: cashierToken,
        body,
      });

      expect(response.status).toBe(400);
    });

    test('an administrator at the till may adjust the price too', async () => {
      const order = await openTable();
      await addCoffee(order.id, 1);

      const response = await request(`/orders/${order.id}/pricing`, {
        method: 'PATCH',
        token: adminToken,
        body: { adjustment: { type: 'DISCOUNT', mode: 'FIXED', value: 100 } },
      });

      expect((await json<OrderDto>(response)).totalCents).toBe(900);
    });
  });

  describe('paying', () => {
    test('records the cash handed over and returns the change', async () => {
      const order = await openTable();
      await addCoffee(order.id, 2);

      const closed = await json<OrderDto>(
        await request(`/orders/${order.id}/close`, {
          method: 'POST',
          token: cashierToken,
          body: { payments: [{ method: 'CASH', amountCents: 2000, receivedCents: 5000 }] },
        }),
      );

      expect(closed.payments).toEqual([
        { method: 'CASH', amountCents: 2000, receivedCents: 5000, changeCents: 3000 },
      ]);
    });

    test('rejects less cash than the amount, and a tender on another method', async () => {
      const order = await openTable();
      await addCoffee(order.id, 2);

      for (const payment of [
        { method: 'CASH', amountCents: 2000, receivedCents: 1500 },
        { method: 'PIX', amountCents: 2000, receivedCents: 2000 },
      ]) {
        const response = await request(`/orders/${order.id}/close`, {
          method: 'POST',
          token: cashierToken,
          body: { payments: [payment] },
        });
        expect(response.status).toBe(400);
      }
    });

    test('payments must match the total including the fee', async () => {
      await enableServiceFee(1000);
      const order = await openTable();
      await addCoffee(order.id, 2);

      const short = await request(`/orders/${order.id}/close`, {
        method: 'POST',
        token: cashierToken,
        body: { payments: [{ method: 'PIX', amountCents: 2000 }] },
      });
      const exact = await request(`/orders/${order.id}/close`, {
        method: 'POST',
        token: cashierToken,
        body: { payments: [{ method: 'PIX', amountCents: 2200 }] },
      });

      expect(short.status).toBe(409);
      expect(exact.status).toBe(200);
    });
  });

  describe('lines', () => {
    test('removes a line, and refuses one that is not on the order', async () => {
      const order = await openTable();
      await addCoffee(order.id, 1);

      const removed = await request(`/orders/${order.id}/items/${itemId}`, {
        method: 'DELETE',
        token: serverToken,
      });
      expect((await json<OrderDto>(removed)).items).toHaveLength(0);

      const again = await request(`/orders/${order.id}/items/${itemId}`, {
        method: 'DELETE',
        token: serverToken,
      });
      expect(again.status).toBe(409);
    });

    test('the cashier may remove a line too, but an administrator may not', async () => {
      const order = await openTable();
      await addCoffee(order.id, 1);

      const forbidden = await request(`/orders/${order.id}/items/${itemId}`, {
        method: 'DELETE',
        token: adminToken,
      });
      const allowed = await request(`/orders/${order.id}/items/${itemId}`, {
        method: 'DELETE',
        token: cashierToken,
      });

      expect(forbidden.status).toBe(403);
      expect(allowed.status).toBe(200);
    });
  });

  describe('seeing the orders', () => {
    test('servers and cashiers list the orders still being served, newest first', async () => {
      const first = await openTable('T-1');
      const second = await openTable('T-2');
      await addCoffee(second.id, 1);
      await request(`/orders/${second.id}/request-payment`, { method: 'POST', token: serverToken });
      const done = await openTable('T-3');
      await request(`/orders/${done.id}/cancel`, { method: 'POST', token: cashierToken });

      for (const token of [serverToken, cashierToken]) {
        const page = await json<PageDto<OrderDto>>(
          await request('/orders?statuses=OPEN,AWAITING_PAYMENT', { token }),
        );

        expect(page.pagination.total).toBe(2);
        expect(page.data.map((order) => order.id)).toEqual([second.id, first.id]);
      }
    });

    test('filters by table', async () => {
      await openTable('T-1');
      const target = await openTable('T-2');

      const page = await json<PageDto<OrderDto>>(
        await request('/orders?statuses=OPEN&tableCode=T-2', { token: serverToken }),
      );

      expect(page.data.map((order) => order.id)).toEqual([target.id]);
    });

    test('anything that could include history needs the history permission', async () => {
      for (const query of ['', '?status=CLOSED', '?statuses=OPEN,CLOSED']) {
        expect((await request(`/orders${query}`, { token: serverToken })).status).toBe(403);
      }
      expect((await request('/orders?status=CLOSED', { token: cashierToken })).status).toBe(200);
    });

    test('rejects an unknown status', async () => {
      expect((await request('/orders?statuses=OPEN,BOGUS', { token: cashierToken })).status).toBe(
        400,
      );
    });

    test('a server follows a live order but cannot read a closed one', async () => {
      const live = await openTable('T-1');
      const done = await openTable('T-2');
      await request(`/orders/${done.id}/cancel`, { method: 'POST', token: cashierToken });

      expect((await request(`/orders/${live.id}`, { token: serverToken })).status).toBe(200);
      expect((await request(`/orders/${done.id}`, { token: serverToken })).status).toBe(403);
      expect((await request(`/orders/${done.id}`, { token: cashierToken })).status).toBe(200);
    });
  });

  describe('opening a table', () => {
    test('tells the client which order already occupies the table', async () => {
      const order = await openTable('T-1');

      const again = await request('/orders/table', {
        method: 'POST',
        token: serverToken,
        body: { tableCode: 'T-1' },
      });
      const body = await json<ErrorDto>(again);

      expect(again.status).toBe(409);
      expect(body.error.code).toBe('TABLE_OCCUPIED');
      expect(body.error.details?.orderId).toBe(order.id);
    });

    test('the table stays occupied while it awaits payment, and frees up once closed', async () => {
      const order = await openTable('T-1');
      await addCoffee(order.id, 1);
      await request(`/orders/${order.id}/request-payment`, { method: 'POST', token: serverToken });

      const occupied = await request('/orders/table', {
        method: 'POST',
        token: serverToken,
        body: { tableCode: 'T-1' },
      });
      expect(occupied.status).toBe(409);

      await request(`/orders/${order.id}/cancel`, { method: 'POST', token: cashierToken });
      const reopened = await request('/orders/table', {
        method: 'POST',
        token: serverToken,
        body: { tableCode: 'T-1' },
      });
      expect(reopened.status).toBe(201);
    });
  });

  describe('counter sales', () => {
    test('keep the customer name, the adjustment, the fee, and the change', async () => {
      await enableServiceFee(1000);

      const response = await request('/orders/counter', {
        method: 'POST',
        token: cashierToken,
        body: {
          label: 'Maria',
          items: [{ itemId, quantity: 1 }],
          adjustment: { type: 'SURCHARGE', mode: 'FIXED', value: 200 },
          applyServiceFee: true,
          payments: [{ method: 'CASH', amountCents: 1320, receivedCents: 2000 }],
        },
      });
      const order = await json<OrderDto>(response);

      expect(response.status).toBe(201);
      expect(order).toMatchObject({
        type: 'COUNTER',
        status: 'CLOSED',
        label: 'Maria',
        subtotalCents: 1000,
        adjustmentCents: 200,
        serviceFeeCents: 120,
        totalCents: 1320,
      });
      expect(order.payments[0]?.changeCents).toBe(680);
    });

    test('charge no fee unless asked to', async () => {
      await enableServiceFee(1000);

      const response = await request('/orders/counter', {
        method: 'POST',
        token: cashierToken,
        body: {
          items: [{ itemId, quantity: 1 }],
          payments: [{ method: 'PIX', amountCents: 1000 }],
        },
      });

      expect(response.status).toBe(201);
      expect((await json<OrderDto>(response)).serviceFeeCents).toBe(0);
    });

    test('are refused when the payments do not cover the total with the fee', async () => {
      await enableServiceFee(1000);

      const response = await request('/orders/counter', {
        method: 'POST',
        token: cashierToken,
        body: {
          items: [{ itemId, quantity: 1 }],
          applyServiceFee: true,
          payments: [{ method: 'PIX', amountCents: 1000 }],
        },
      });

      expect(response.status).toBe(409);
    });
  });
});

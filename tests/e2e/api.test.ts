import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { loadConfig } from '@/app/config';
import { createContainer } from '@/app/container';
import { createApp } from '@/app/http/app';
import type { AppContainer } from '@/app/http/types';
import { UserID } from '@/domain/value-objects/ids';
import { resetDatabase, TEST_DATABASE_URL } from '../integration/support/database';

interface UserDto {
  id: string;
  name: string;
  email: string;
  roles: string[];
  isActive: boolean;
}

interface ItemDto {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  imageUrl: string | null;
  isActive: boolean;
}

interface OrderItemDto {
  itemId: string;
  itemName: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

interface OrderPaymentDto {
  method: string;
  amountCents: number;
}

interface OrderDto {
  id: string;
  type: string;
  status: string;
  tableCode: string | null;
  closedByUserId: string | null;
  canceledByUserId: string | null;
  totalCents: number;
  items: OrderItemDto[];
  payments: OrderPaymentDto[];
}

interface PageDto<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

interface LoginDto {
  accessToken: string;
  expiresAt: string;
  user: UserDto & Record<string, unknown>;
}

interface ErrorDto {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

const ADMIN_PASSWORD = 'admin-password';
const CASHIER_PASSWORD = 'cashier-password';
const SERVER_PASSWORD = 'server-password';

function testConfig() {
  if (!TEST_DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL is required for API tests');
  }

  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_READ_URL: TEST_DATABASE_URL,
    DATABASE_WRITE_URL: TEST_DATABASE_URL,
    JWT_SECRET: 'a'.repeat(32),
    JWT_ISSUER: 'comando',
    JWT_AUDIENCE: 'comando-api',
    JWT_EXPIRES_IN_SECONDS: '900',
    CORS_ORIGIN: '*',
    BODY_LIMIT_BYTES: '1024',
    LOGIN_RATE_LIMIT_MAX: '100',
    LOGIN_RATE_LIMIT_WINDOW_SECONDS: '60',
    LOG_LEVEL: 'error',
  });
}

describe.skipIf(!TEST_DATABASE_URL)('HTTP API', () => {
  let container: AppContainer;
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    container = createContainer(testConfig());
    app = createApp(container);
  });

  beforeEach(async () => {
    await resetDatabase(container.database);
  });

  afterAll(async () => {
    await container.close();
  });

  async function createAdmin(email = 'admin@example.com'): Promise<UserDto> {
    const user = await container.repositories.users.create({
      name: 'Admin',
      email,
      passwordHash: await container.passwordHasher.hash(ADMIN_PASSWORD),
      roles: ['ADMIN'],
      now: new Date(),
    });

    return {
      id: user.id.value,
      name: user.name,
      email: user.email,
      roles: [...user.roles],
      isActive: user.isActive,
    };
  }

  async function login(email: string, password: string) {
    const response = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    return { response, body: await readJson<LoginDto | ErrorDto>(response) };
  }

  async function loginToken(email: string, password: string): Promise<string> {
    const { response, body } = await login(email, password);
    expect(response.status).toBe(200);
    return (body as LoginDto).accessToken;
  }

  async function readJson<T>(response: Response): Promise<T> {
    return (await response.json()) as T;
  }

  async function request(
    path: string,
    options: {
      method?: string;
      token?: string;
      body?: unknown;
      headers?: Record<string, string>;
    } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = { ...options.headers };

    if (options.token !== undefined) {
      headers.authorization = `Bearer ${options.token}`;
    }

    if (options.body !== undefined) {
      headers['content-type'] = 'application/json';
    }

    return app.request(path, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  }

  async function createUserViaApi(
    adminToken: string,
    input: { name: string; email: string; password: string; roles: string[] },
  ): Promise<UserDto> {
    const response = await request('/users', {
      method: 'POST',
      token: adminToken,
      body: input,
    });

    expect(response.status).toBe(201);
    return readJson<UserDto>(response);
  }

  async function createItemViaApi(
    adminToken: string,
    input: { name: string; priceCents: number; description?: string | null },
  ): Promise<ItemDto> {
    const response = await request('/items', {
      method: 'POST',
      token: adminToken,
      body: input,
    });

    expect(response.status).toBe(201);
    return readJson<ItemDto>(response);
  }

  test('authenticates users and rejects missing, invalid, and disabled credentials', async () => {
    const admin = await createAdmin();
    const { response, body } = await login('ADMIN@example.com', ADMIN_PASSWORD);

    expect(response.status).toBe(200);
    const loginBody = body as LoginDto;
    expect(loginBody.user.id).toBe(admin.id);
    expect(loginBody.user.email).toBe('admin@example.com');
    expect(loginBody.user).not.toHaveProperty('passwordHash');
    expect(loginBody.accessToken.length).toBeGreaterThan(20);
    expect(Number.isNaN(Date.parse(loginBody.expiresAt))).toBe(false);

    const missing = await request('/users');
    expect(missing.status).toBe(401);

    const invalid = await request('/users', { token: 'not-a-jwt' });
    expect(invalid.status).toBe(401);

    const wrongPassword = await login(admin.email, 'wrong-password');
    expect(wrongPassword.response.status).toBe(401);

    await container.unitOfWork.run(async (repositories) => {
      const user = await repositories.users.findById(new UserID(admin.id));
      if (user === null) {
        throw new Error('Expected admin user');
      }
      user.deactivate(new Date());
      await repositories.users.update(user);
    });

    const disabledRequest = await request('/users', { token: loginBody.accessToken });
    expect(disabledRequest.status).toBe(401);

    const disabledLogin = await login(admin.email, ADMIN_PASSWORD);
    expect(disabledLogin.response.status).toBe(401);
  });

  test('lets ADMIN manage users while rejecting other roles', async () => {
    await createAdmin();
    const adminToken = await loginToken('admin@example.com', ADMIN_PASSWORD);
    const cashier = await createUserViaApi(adminToken, {
      name: 'Cashier',
      email: 'cashier@example.com',
      password: CASHIER_PASSWORD,
      roles: ['CASHIER'],
    });

    const duplicate = await request('/users', {
      method: 'POST',
      token: adminToken,
      body: {
        name: 'Duplicate',
        email: 'CASHIER@example.com',
        password: 'other-password',
        roles: ['SERVER'],
      },
    });
    expect(duplicate.status).toBe(409);

    const list = await request('/users?page=1&pageSize=20', { token: adminToken });
    expect(list.status).toBe(200);
    const page = await readJson<PageDto<UserDto>>(list);
    expect(page.pagination.total).toBe(2);
    expect(page.pagination.totalPages).toBe(1);

    const single = await request(`/users/${cashier.id}`, { token: adminToken });
    expect(single.status).toBe(200);
    expect((await readJson<UserDto>(single)).email).toBe('cashier@example.com');

    const update = await request(`/users/${cashier.id}`, {
      method: 'PATCH',
      token: adminToken,
      body: { name: 'Updated Cashier', roles: ['CASHIER', 'SERVER'] },
    });
    expect(update.status).toBe(200);
    const updated = await readJson<UserDto>(update);
    expect(updated.name).toBe('Updated Cashier');
    expect(updated.roles).toEqual(['CASHIER', 'SERVER']);

    const cashierToken = await loginToken('cashier@example.com', CASHIER_PASSWORD);
    expect((await request('/users', { token: cashierToken })).status).toBe(403);
    expect(
      (
        await request('/users', {
          method: 'POST',
          token: cashierToken,
          body: {
            name: 'Nope',
            email: 'nope@example.com',
            password: 'nope-password',
            roles: ['SERVER'],
          },
        })
      ).status,
    ).toBe(403);

    const invalidBody = await request('/users', {
      method: 'POST',
      token: adminToken,
      body: { name: 'Missing fields' },
    });
    expect(invalidBody.status).toBe(400);
    const invalidError = await readJson<ErrorDto>(invalidBody);
    expect(invalidError.error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(invalidError.error.details)).toBe(true);

    const deactivate = await request(`/users/${cashier.id}`, {
      method: 'DELETE',
      token: adminToken,
    });
    expect(deactivate.status).toBe(200);
    expect((await readJson<UserDto>(deactivate)).isActive).toBe(false);

    const disabledLogin = await login('cashier@example.com', CASHIER_PASSWORD);
    expect(disabledLogin.response.status).toBe(401);
  });

  test('lets ADMIN manage items and enforces catalog visibility', async () => {
    await createAdmin();
    const adminToken = await loginToken('admin@example.com', ADMIN_PASSWORD);
    await createUserViaApi(adminToken, {
      name: 'Cashier',
      email: 'cashier@example.com',
      password: CASHIER_PASSWORD,
      roles: ['CASHIER'],
    });
    const cashierToken = await loginToken('cashier@example.com', CASHIER_PASSWORD);

    const item = await createItemViaApi(adminToken, {
      name: 'Coffee',
      description: 'Hot coffee',
      priceCents: 750,
    });
    expect(item.isActive).toBe(true);

    const cashierCreate = await request('/items', {
      method: 'POST',
      token: cashierToken,
      body: { name: 'Tea', priceCents: 500 },
    });
    expect(cashierCreate.status).toBe(403);

    const cashierCatalog = await request('/items', { token: cashierToken });
    expect(cashierCatalog.status).toBe(200);
    const catalog = await readJson<PageDto<ItemDto>>(cashierCatalog);
    expect(catalog.pagination.total).toBe(1);

    const update = await request(`/items/${item.id}`, {
      method: 'PATCH',
      token: adminToken,
      body: { priceCents: 900 },
    });
    expect(update.status).toBe(200);
    expect((await readJson<ItemDto>(update)).priceCents).toBe(900);

    const remove = await request(`/items/${item.id}`, {
      method: 'DELETE',
      token: adminToken,
    });
    expect(remove.status).toBe(200);
    expect((await readJson<ItemDto>(remove)).isActive).toBe(false);

    const activeOnly = await readJson<PageDto<ItemDto>>(
      await request('/items', { token: cashierToken }),
    );
    expect(activeOnly.pagination.total).toBe(0);

    const hiddenForCashier = await readJson<PageDto<ItemDto>>(
      await request('/items?includeRemoved=true', { token: cashierToken }),
    );
    expect(hiddenForCashier.pagination.total).toBe(0);

    const visibleForAdmin = await readJson<PageDto<ItemDto>>(
      await request('/items?includeRemoved=true', { token: adminToken }),
    );
    expect(visibleForAdmin.pagination.total).toBe(1);

    expect((await request(`/items/${item.id}`, { token: cashierToken })).status).toBe(404);
    const removedForAdmin = await request(`/items/${item.id}`, { token: adminToken });
    expect(removedForAdmin.status).toBe(200);
    expect((await readJson<ItemDto>(removedForAdmin)).isActive).toBe(false);

    const editRemoved = await request(`/items/${item.id}`, {
      method: 'PATCH',
      token: adminToken,
      body: { name: 'Nope' },
    });
    expect(editRemoved.status).toBe(409);
  });

  test('creates counter orders, preserves snapshots, and restricts history', async () => {
    await createAdmin();
    const adminToken = await loginToken('admin@example.com', ADMIN_PASSWORD);
    await createUserViaApi(adminToken, {
      name: 'Cashier',
      email: 'cashier@example.com',
      password: CASHIER_PASSWORD,
      roles: ['CASHIER'],
    });
    await createUserViaApi(adminToken, {
      name: 'Server',
      email: 'server@example.com',
      password: SERVER_PASSWORD,
      roles: ['SERVER'],
    });
    const cashierToken = await loginToken('cashier@example.com', CASHIER_PASSWORD);
    const serverToken = await loginToken('server@example.com', SERVER_PASSWORD);
    const coffee = await createItemViaApi(adminToken, { name: 'Coffee', priceCents: 750 });
    const cake = await createItemViaApi(adminToken, { name: 'Cake', priceCents: 300 });

    const create = await request('/orders/counter', {
      method: 'POST',
      token: cashierToken,
      body: {
        items: [
          { itemId: coffee.id, quantity: 2 },
          { itemId: cake.id, quantity: 1 },
          { itemId: coffee.id, quantity: 1 },
        ],
        payments: [
          { method: 'CASH', amountCents: 1000 },
          { method: 'CREDIT_CARD', amountCents: 1550 },
        ],
      },
    });
    expect(create.status).toBe(201);
    const order = await readJson<OrderDto>(create);
    expect(order.status).toBe('CLOSED');
    expect(order.totalCents).toBe(2550);
    expect(order.items).toHaveLength(2);
    expect(order.items.find((item) => item.itemId === coffee.id)?.quantity).toBe(3);

    await request(`/items/${coffee.id}`, {
      method: 'PATCH',
      token: adminToken,
      body: { priceCents: 999 },
    });

    const afterPriceChange = await readJson<OrderDto>(
      await request(`/orders/${order.id}`, { token: cashierToken }),
    );
    expect(afterPriceChange.totalCents).toBe(2550);
    expect(afterPriceChange.items.find((item) => item.itemId === coffee.id)?.unitPriceCents).toBe(
      750,
    );

    expect(
      (
        await request('/orders/counter', {
          method: 'POST',
          token: serverToken,
          body: {
            items: [{ itemId: coffee.id, quantity: 1 }],
            payments: [{ method: 'CASH', amountCents: 999 }],
          },
        })
      ).status,
    ).toBe(403);

    expect(
      (
        await request('/orders/counter', {
          method: 'POST',
          token: cashierToken,
          body: {
            items: [{ itemId: coffee.id, quantity: 1 }],
            payments: [{ method: 'CASH', amountCents: 900 }],
          },
        })
      ).status,
    ).toBe(409);

    expect(
      (
        await request('/orders/counter', {
          method: 'POST',
          token: cashierToken,
          body: {
            items: [{ itemId: '999999', quantity: 1 }],
            payments: [{ method: 'CASH', amountCents: 750 }],
          },
        })
      ).status,
    ).toBe(404);

    const history = await request('/orders?type=COUNTER&status=CLOSED&page=1&pageSize=20', {
      token: cashierToken,
    });
    expect(history.status).toBe(200);
    const historyPage = await readJson<PageDto<OrderDto>>(history);
    expect(historyPage.pagination.total).toBe(1);
    expect(historyPage.data[0]?.id).toBe(order.id);

    expect(
      (await request('/orders?type=COUNTER&status=CLOSED', { token: serverToken })).status,
    ).toBe(403);
    expect((await request('/orders?pageSize=1000', { token: cashierToken })).status).toBe(400);
  });

  test('runs the table order lifecycle and enforces role boundaries', async () => {
    await createAdmin();
    const adminToken = await loginToken('admin@example.com', ADMIN_PASSWORD);
    await createUserViaApi(adminToken, {
      name: 'Cashier',
      email: 'cashier@example.com',
      password: CASHIER_PASSWORD,
      roles: ['CASHIER'],
    });
    await createUserViaApi(adminToken, {
      name: 'Server',
      email: 'server@example.com',
      password: SERVER_PASSWORD,
      roles: ['SERVER'],
    });
    const cashierToken = await loginToken('cashier@example.com', CASHIER_PASSWORD);
    const serverToken = await loginToken('server@example.com', SERVER_PASSWORD);
    const coffee = await createItemViaApi(adminToken, { name: 'Coffee', priceCents: 750 });

    const open = await request('/orders/table', {
      method: 'POST',
      token: serverToken,
      body: { tableCode: 'T-01' },
    });
    expect(open.status).toBe(201);
    const order = await readJson<OrderDto>(open);
    expect(order.status).toBe('OPEN');
    expect(order.totalCents).toBe(0);

    expect(
      (
        await request('/orders/table', {
          method: 'POST',
          token: serverToken,
          body: { tableCode: 'T-01' },
        })
      ).status,
    ).toBe(409);

    expect(
      (
        await request('/orders/table', {
          method: 'POST',
          token: cashierToken,
          body: { tableCode: 'T-02' },
        })
      ).status,
    ).toBe(403);

    const added = await request(`/orders/${order.id}/items`, {
      method: 'POST',
      token: serverToken,
      body: { items: [{ itemId: coffee.id, quantity: 2 }] },
    });
    expect(added.status).toBe(200);
    expect((await readJson<OrderDto>(added)).items[0]?.quantity).toBe(2);

    const incremented = await request(`/orders/${order.id}/items`, {
      method: 'POST',
      token: serverToken,
      body: { items: [{ itemId: coffee.id, quantity: 1 }] },
    });
    expect(incremented.status).toBe(200);
    expect((await readJson<OrderDto>(incremented)).items[0]?.quantity).toBe(3);

    const changed = await request(`/orders/${order.id}/items/${coffee.id}`, {
      method: 'PATCH',
      token: serverToken,
      body: { quantity: 5 },
    });
    expect(changed.status).toBe(200);
    expect((await readJson<OrderDto>(changed)).totalCents).toBe(3750);

    expect(
      (
        await request(`/orders/${order.id}/items`, {
          method: 'POST',
          token: cashierToken,
          body: { items: [{ itemId: coffee.id, quantity: 1 }] },
        })
      ).status,
    ).toBe(403);

    const closed = await request(`/orders/${order.id}/close`, {
      method: 'POST',
      token: cashierToken,
      body: {
        payments: [
          { method: 'CASH', amountCents: 1000 },
          { method: 'PIX', amountCents: 2750 },
        ],
      },
    });
    expect(closed.status).toBe(200);
    const closedOrder = await readJson<OrderDto>(closed);
    expect(closedOrder.status).toBe('CLOSED');
    expect(closedOrder.closedByUserId).not.toBeNull();

    expect(
      (
        await request(`/orders/${order.id}/items`, {
          method: 'POST',
          token: serverToken,
          body: { items: [{ itemId: coffee.id, quantity: 1 }] },
        })
      ).status,
    ).toBe(409);
    expect(
      (await request(`/orders/${order.id}/cancel`, { method: 'POST', token: serverToken })).status,
    ).toBe(409);

    const toCancel = await readJson<OrderDto>(
      await request('/orders/table', {
        method: 'POST',
        token: serverToken,
        body: { tableCode: 'T-02' },
      }),
    );
    const canceled = await request(`/orders/${toCancel.id}/cancel`, {
      method: 'POST',
      token: serverToken,
    });
    expect(canceled.status).toBe(200);
    expect((await readJson<OrderDto>(canceled)).status).toBe('CANCELED');
    expect(
      (
        await request(`/orders/${toCancel.id}/close`, {
          method: 'POST',
          token: cashierToken,
          body: { payments: [] },
        })
      ).status,
    ).toBe(409);

    const empty = await readJson<OrderDto>(
      await request('/orders/table', {
        method: 'POST',
        token: serverToken,
        body: { tableCode: 'T-03' },
      }),
    );
    const closedEmpty = await request(`/orders/${empty.id}/close`, {
      method: 'POST',
      token: cashierToken,
      body: { payments: [] },
    });
    expect(closedEmpty.status).toBe(200);
    expect((await readJson<OrderDto>(closedEmpty)).totalCents).toBe(0);
  });

  test('applies payload limits, CORS, rate limiting, and unknown-route handling', async () => {
    const payload = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.com', password: 'a'.repeat(2_000) }),
    });
    expect(payload.status).toBe(413);
    expect((await readJson<ErrorDto>(payload)).error.code).toBe('PAYLOAD_TOO_LARGE');

    const preflight = await app.request('/users', {
      method: 'OPTIONS',
      headers: {
        origin: 'https://example.com',
        'access-control-request-method': 'GET',
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('*');

    const missing = await app.request('/missing');
    expect(missing.status).toBe(404);
    expect((await readJson<ErrorDto>(missing)).error.code).toBe('NOT_FOUND');

    const rateContainer = createContainer(
      loadConfig({
        ...processEnvForRateLimit(),
        LOGIN_RATE_LIMIT_MAX: '1',
      }),
    );
    const rateApp = createApp(rateContainer);

    try {
      await rateContainer.repositories.users.create({
        name: 'Rate Admin',
        email: 'rate@example.com',
        passwordHash: await rateContainer.passwordHasher.hash('rate-password'),
        roles: ['ADMIN'],
        now: new Date(),
      });

      const attempt = () =>
        rateApp.request('/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.10' },
          body: JSON.stringify({ email: 'rate@example.com', password: 'wrong-password' }),
        });

      expect((await attempt()).status).toBe(401);
      const limited = await attempt();
      expect(limited.status).toBe(429);
      expect(limited.headers.get('retry-after')).toBeTruthy();
      expect((await readJson<ErrorDto>(limited)).error.code).toBe('TOO_MANY_REQUESTS');
    } finally {
      await rateContainer.close();
    }
  });
});

function processEnvForRateLimit(): Record<string, string> {
  if (!TEST_DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL is required for API tests');
  }

  return {
    NODE_ENV: 'test',
    DATABASE_READ_URL: TEST_DATABASE_URL,
    DATABASE_WRITE_URL: TEST_DATABASE_URL,
    JWT_SECRET: 'a'.repeat(32),
    JWT_ISSUER: 'comando',
    JWT_AUDIENCE: 'comando-api',
    JWT_EXPIRES_IN_SECONDS: '900',
    CORS_ORIGIN: '*',
    BODY_LIMIT_BYTES: '1024',
    LOGIN_RATE_LIMIT_WINDOW_SECONDS: '60',
    LOG_LEVEL: 'error',
  };
}

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { AppContainer } from '@/app/container';
import { resetDatabase, TEST_DATABASE_URL } from '../integration/support/database';
import { createHarness, PASSWORD } from './support/harness';

interface AuditRow {
  action: string;
  target_type: string;
  target_id: string | null;
  request_id: string | null;
  actor_user_id: string | null;
  metadata: Record<string, unknown>;
}

const { start, request, createUser } = createHarness();

describe.skipIf(!TEST_DATABASE_URL)('audit events', () => {
  let container: AppContainer;
  let adminToken: string;
  let adminId: string;

  beforeAll(() => {
    container = start();
  });

  beforeEach(async () => {
    await resetDatabase(container.database);
    adminId = await createUser('admin', ['ADMIN', 'CASHIER']);
    const login = await call('POST', '/auth/login', {
      email: 'admin@example.com',
      password: PASSWORD,
    });
    adminToken = ((await login.json()) as { accessToken: string }).accessToken;
  });

  afterAll(async () => {
    await container.close();
  });

  const call = (method: string, path: string, body?: unknown, token?: string) =>
    request(path, { method, body, token });

  const asAdmin = (method: string, path: string, body?: unknown) =>
    call(method, path, body, adminToken);

  const rows = () =>
    container.database.writeSql().query<AuditRow[]>`
      SELECT action, target_type, target_id, request_id, actor_user_id::text AS actor_user_id, metadata
      FROM audit_logs ORDER BY id
    `;

  test('administrative actions leave one row each, tied to the request id', async () => {
    const created = await asAdmin('POST', '/users', {
      name: 'Ada',
      email: 'ada@example.com',
      password: 'server-password',
      roles: ['SERVER'],
    });
    const user = (await created.json()) as { id: string };
    const requestId = created.headers.get('x-request-id');

    await asAdmin('PATCH', `/users/${user.id}`, { name: 'Ada L.' });
    await asAdmin('DELETE', `/users/${user.id}`);
    const item = (await (
      await asAdmin('POST', '/items', { name: 'Coffee', priceCents: 1000 })
    ).json()) as {
      id: string;
    };
    await asAdmin('PATCH', `/items/${item.id}`, { name: 'Espresso' });
    await asAdmin('DELETE', `/items/${item.id}`);
    await asAdmin('PUT', '/settings', { serviceFeeEnabled: true, serviceFeeBasisPoints: 1000 });

    const recorded = await rows();

    expect(recorded.map((row) => row.action)).toEqual([
      'user.create',
      'user.update',
      'user.deactivate',
      'item.create',
      'item.update',
      'item.remove',
      'settings.update',
    ]);
    expect(recorded[0]).toMatchObject({
      target_type: 'user',
      target_id: user.id,
      request_id: requestId,
      actor_user_id: adminId,
    });
    expect(new Set(recorded.map((row) => row.request_id)).size).toBe(recorded.length);
    // No credential ever reaches the trail.
    expect(JSON.stringify(recorded)).not.toContain('server-password');
    expect(JSON.stringify(recorded)).not.toContain('$argon2');
  });

  test('every order lifecycle step is recorded', async () => {
    const item = (await (
      await asAdmin('POST', '/items', { name: 'Coffee', priceCents: 1000 })
    ).json()) as {
      id: string;
    };
    const table = (await (await asAdmin('POST', '/orders/table', { tableCode: 'T1' })).json()) as {
      id: string;
    };
    await asAdmin('POST', `/orders/${table.id}/items`, {
      items: [{ itemId: item.id, quantity: 1 }],
    });
    await asAdmin('PATCH', `/orders/${table.id}/pricing`, { applyServiceFee: false });
    await asAdmin('POST', `/orders/${table.id}/request-payment`);
    await asAdmin('POST', `/orders/${table.id}/reopen`);
    await asAdmin('POST', `/orders/${table.id}/close`, {
      payments: [{ method: 'PIX', amountCents: 1000 }],
    });
    await asAdmin('POST', '/orders/counter', {
      items: [{ itemId: item.id, quantity: 2 }],
      payments: [{ method: 'PIX', amountCents: 2000 }],
    });
    const second = (await (await asAdmin('POST', '/orders/table', { tableCode: 'T2' })).json()) as {
      id: string;
    };
    await asAdmin('POST', `/orders/${second.id}/cancel`);

    const actions = (await rows())
      .map((row) => row.action)
      .filter((action) => action.startsWith('order.'));

    expect(actions).toEqual([
      'order.table.open',
      'order.pricing.set',
      'order.payment.request',
      'order.reopen',
      'order.close',
      'order.counter.create',
      'order.table.open',
      'order.cancel',
    ]);
    expect((await rows()).find((row) => row.action === 'order.close')?.metadata).toEqual({
      totalCents: 1000,
    });
  });

  test('a rejected action leaves no audit row', async () => {
    const forbidden = await call('POST', '/items', { name: 'Nope', priceCents: 1 }, undefined);
    expect(forbidden.status).toBe(401);

    const invalid = await asAdmin('POST', '/orders/9999/cancel');
    expect(invalid.status).toBe(404);

    expect(await rows()).toHaveLength(0);
  });

  test('token reuse is audited even though the request fails', async () => {
    const login = await call('POST', '/auth/login', {
      email: 'admin@example.com',
      password: PASSWORD,
    });
    const { refreshToken } = (await login.json()) as { refreshToken: string };
    await call('POST', '/auth/refresh', { refreshToken });
    const reuse = await call('POST', '/auth/refresh', { refreshToken });

    expect(reuse.status).toBe(401);
    expect((await rows()).map((row) => row.action)).toEqual(['auth.refresh.reuse']);
    expect((await rows())[0]).toMatchObject({ actor_user_id: adminId, target_id: adminId });
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { AppContainer } from '@/app/container';
import { resetDatabase, TEST_DATABASE_URL } from '../integration/support/database';
import { createHarness, PASSWORD } from './support/harness';

interface ItemDto {
  id: string;
  name: string;
  category: string;
  enabled: boolean;
  isActive: boolean;
  priceCents: number;
}

interface UserDto {
  id: string;
  email: string;
  roles: string[];
  isActive: boolean;
}

interface ErrorDto {
  error: { code: string; message: string };
}

interface PageDto<T> {
  data: T[];
  pagination: { total: number };
}

interface SettingsDto {
  serviceFeeEnabled: boolean;
  serviceFeeBasisPoints: number;
  updatedAt: string;
}

const { start, request, createUser, login } = createHarness();

describe.skipIf(!TEST_DATABASE_URL)('catalog, settings, and user administration API', () => {
  let container: AppContainer;
  let adminToken: string;
  let cashierToken: string;

  beforeAll(() => {
    container = start();
  });

  beforeEach(async () => {
    await resetDatabase(container.database);
    await createUser('admin', ['ADMIN']);
    await createUser('cashier', ['CASHIER']);
    adminToken = await login('admin');
    cashierToken = await login('cashier');
  });

  afterAll(async () => {
    await container.close();
  });

  const json = async <T>(response: Response): Promise<T> => (await response.json()) as T;

  async function createItem(body: Record<string, unknown>): Promise<ItemDto> {
    const response = await request('/items', { method: 'POST', token: adminToken, body });
    expect(response.status).toBe(201);
    return json<ItemDto>(response);
  }

  describe('catalog', () => {
    test('stores a category and the enabled switch, with sensible defaults', async () => {
      const plain = await createItem({ name: 'Water', priceCents: 400 });
      const typed = await createItem({
        name: 'Beer',
        priceCents: 1000,
        category: 'Drinks',
        enabled: false,
      });

      expect(plain).toMatchObject({ category: 'Uncategorized', enabled: true, isActive: true });
      expect(typed).toMatchObject({ category: 'Drinks', enabled: false, isActive: true });
    });

    test('updates the category and switches an item on and off', async () => {
      const item = await createItem({ name: 'Beer', priceCents: 1000 });

      const response = await request(`/items/${item.id}`, {
        method: 'PATCH',
        token: adminToken,
        body: { category: 'Drinks', enabled: false },
      });

      expect(await json<ItemDto>(response)).toMatchObject({ category: 'Drinks', enabled: false });
    });

    test('rejects an empty or oversized category', async () => {
      for (const category of ['   ', 'x'.repeat(81)]) {
        const response = await request('/items', {
          method: 'POST',
          token: adminToken,
          body: { name: 'Beer', priceCents: 1000, category },
        });
        expect(response.status).toBe(400);
      }
    });

    test('a cashier lists only what can be sold, grouped by category; an administrator sees all', async () => {
      await createItem({ name: 'Beer', priceCents: 1000, category: 'Drinks' });
      await createItem({ name: 'Burger', priceCents: 2200, category: 'Food' });
      await createItem({ name: 'Old special', priceCents: 900, category: 'Food', enabled: false });

      const sale = await json<PageDto<ItemDto>>(await request('/items', { token: cashierToken }));
      const all = await json<PageDto<ItemDto>>(await request('/items', { token: adminToken }));

      expect(sale.data.map((item) => item.name)).toEqual(['Beer', 'Burger']);
      expect(all.data.map((item) => item.name)).toEqual(['Beer', 'Burger', 'Old special']);
    });

    test('a disabled item is hidden from a cashier but not from an administrator', async () => {
      const item = await createItem({ name: 'Old special', priceCents: 900, enabled: false });

      expect((await request(`/items/${item.id}`, { token: cashierToken })).status).toBe(404);
      expect((await request(`/items/${item.id}`, { token: adminToken })).status).toBe(200);
    });

    test('a disabled item cannot be added to an order', async () => {
      const item = await createItem({ name: 'Old special', priceCents: 900, enabled: false });
      await createUser('server', ['SERVER']);
      const serverToken = await login('server');
      const order = await json<{ id: string }>(
        await request('/orders/table', {
          method: 'POST',
          token: serverToken,
          body: { tableCode: 'T-1' },
        }),
      );

      const response = await request(`/orders/${order.id}/items`, {
        method: 'POST',
        token: serverToken,
        body: { items: [{ itemId: item.id, quantity: 1 }] },
      });

      expect(response.status).toBe(404);
    });
  });

  describe('settings', () => {
    test('every signed-in role reads them, and the service fee starts off', async () => {
      for (const token of [adminToken, cashierToken]) {
        const response = await request('/settings', { token });

        expect(response.status).toBe(200);
        expect(await json<SettingsDto>(response)).toMatchObject({
          serviceFeeEnabled: false,
          serviceFeeBasisPoints: 1000,
        });
      }
    });

    test('an administrator changes the fee and the change is kept', async () => {
      const response = await request('/settings', {
        method: 'PUT',
        token: adminToken,
        body: { serviceFeeEnabled: true, serviceFeeBasisPoints: 1250 },
      });

      expect(await json<SettingsDto>(response)).toMatchObject({
        serviceFeeEnabled: true,
        serviceFeeBasisPoints: 1250,
      });
      expect(
        await json<SettingsDto>(await request('/settings', { token: cashierToken })),
      ).toMatchObject({ serviceFeeEnabled: true, serviceFeeBasisPoints: 1250 });
    });

    test('a cashier cannot change them, and an anonymous caller cannot read them', async () => {
      const forbidden = await request('/settings', {
        method: 'PUT',
        token: cashierToken,
        body: { serviceFeeEnabled: true },
      });

      expect(forbidden.status).toBe(403);
      expect((await request('/settings')).status).toBe(401);
    });

    test.each([
      ['an empty body', {}],
      ['a rate above 100%', { serviceFeeBasisPoints: 10_001 }],
      ['a negative rate', { serviceFeeBasisPoints: -1 }],
      ['a fractional rate', { serviceFeeBasisPoints: 12.5 }],
      ['a non-boolean switch', { serviceFeeEnabled: 'yes' }],
    ])('rejects %s', async (_label, body) => {
      const response = await request('/settings', { method: 'PUT', token: adminToken, body });

      expect(response.status).toBe(400);
    });
  });

  describe('users', () => {
    const newUser = {
      name: 'Ada',
      email: 'ada@example.com',
      password: PASSWORD,
      roles: ['SERVER'],
    };

    test('passwords need at least 8 characters, when creating and when updating', async () => {
      const short = await request('/users', {
        method: 'POST',
        token: adminToken,
        body: { ...newUser, password: 'short' },
      });
      const created = await request('/users', { method: 'POST', token: adminToken, body: newUser });
      const user = await json<UserDto>(created);
      const update = await request(`/users/${user.id}`, {
        method: 'PATCH',
        token: adminToken,
        body: { password: 'short' },
      });

      expect(short.status).toBe(400);
      expect(created.status).toBe(201);
      expect(update.status).toBe(400);
    });

    test('a deactivated user can be reactivated and signs in again', async () => {
      const user = await json<UserDto>(
        await request('/users', { method: 'POST', token: adminToken, body: newUser }),
      );
      await request(`/users/${user.id}`, { method: 'DELETE', token: adminToken });

      const blocked = await request('/auth/login', {
        method: 'POST',
        body: { email: newUser.email, password: PASSWORD },
      });
      expect(blocked.status).toBe(401);

      const reactivated = await request(`/users/${user.id}`, {
        method: 'PATCH',
        token: adminToken,
        body: { isActive: true, name: 'Ada Lovelace' },
      });
      expect(await json<UserDto & { name: string }>(reactivated)).toMatchObject({
        isActive: true,
        name: 'Ada Lovelace',
      });

      const back = await request('/auth/login', {
        method: 'POST',
        body: { email: newUser.email, password: PASSWORD },
      });
      expect(back.status).toBe(200);
    });

    test('a deactivated user accepts no other edit', async () => {
      const user = await json<UserDto>(
        await request('/users', { method: 'POST', token: adminToken, body: newUser }),
      );
      await request(`/users/${user.id}`, { method: 'DELETE', token: adminToken });

      const response = await request(`/users/${user.id}`, {
        method: 'PATCH',
        token: adminToken,
        body: { name: 'Late' },
      });

      expect(response.status).toBe(409);
    });

    test('isActive: false deactivates, like DELETE', async () => {
      const user = await json<UserDto>(
        await request('/users', { method: 'POST', token: adminToken, body: newUser }),
      );

      const response = await request(`/users/${user.id}`, {
        method: 'PATCH',
        token: adminToken,
        body: { isActive: false },
      });

      expect((await json<UserDto>(response)).isActive).toBe(false);
    });

    test('an administrator cannot deactivate or demote themselves', async () => {
      const me = await json<{ user: UserDto }>(
        await request('/auth/login', {
          method: 'POST',
          body: { email: 'admin@example.com', password: PASSWORD },
        }),
      );

      const deleted = await request(`/users/${me.user.id}`, {
        method: 'DELETE',
        token: adminToken,
      });
      const patched = await request(`/users/${me.user.id}`, {
        method: 'PATCH',
        token: adminToken,
        body: { isActive: false },
      });
      const demoted = await request(`/users/${me.user.id}`, {
        method: 'PATCH',
        token: adminToken,
        body: { roles: ['SERVER'] },
      });

      expect((await json<ErrorDto>(deleted)).error.code).toBe('CANNOT_DEACTIVATE_SELF');
      expect((await json<ErrorDto>(patched)).error.code).toBe('CANNOT_DEACTIVATE_SELF');
      expect((await json<ErrorDto>(demoted)).error.code).toBe('CANNOT_REMOVE_OWN_ADMIN');
      expect((await request('/users', { token: adminToken })).status).toBe(200);
    });

    test('two administrators removing each other at once never leave the system without one', async () => {
      const secondId = await createUser('second', ['ADMIN']);
      const secondToken = await login('second');
      const firstId = (
        await json<{ user: UserDto }>(
          await request('/auth/login', {
            method: 'POST',
            body: { email: 'admin@example.com', password: PASSWORD },
          }),
        )
      ).user.id;

      const attempts = await Promise.all([
        request(`/users/${secondId}`, { method: 'DELETE', token: adminToken }),
        request(`/users/${firstId}`, { method: 'DELETE', token: secondToken }),
      ]);

      expect(attempts.filter((response) => response.status === 200)).toHaveLength(1);
      const remaining = await container.database.write.query<{ count: string }[]>`
        SELECT COUNT(DISTINCT u.id)::text AS count
        FROM users u
        JOIN user_roles ur ON ur.user_id = u.id
        JOIN roles r ON r.id = ur.role_id
        WHERE r.code = 'ADMIN' AND u.deleted_at IS NULL
      `;
      expect(remaining[0]?.count).toBe('1');
    });
  });
});

import { describe, expect, test } from 'bun:test';
import type { z } from 'zod';
import { createApp } from '@/app/http/app';
import {
  API_VERSION,
  buildOpenApiDocument,
  documentedOperations,
} from '@/app/http/openapi/document';
import {
  errorResponseSchema,
  healthResponseSchema,
  itemResponseSchema,
  loginResponseSchema,
  orderResponseSchema,
  pageOf,
  userResponseSchema,
} from '@/app/http/openapi/responses';
import {
  toItemResponse,
  toOrderResponse,
  toPageResponse,
  toUserResponse,
} from '@/app/http/serializers';
import { Item } from '@/domain/entity/item';
import { Order } from '@/domain/entity/order';
import { User } from '@/domain/entity/user';
import { ItemID, OrderID, UserID } from '@/domain/value-objects/ids';
import { createTestContainer } from '../support/container';

type Json = Record<string, unknown>;

const document = buildOpenApiDocument() as {
  openapi: string;
  info: Json;
  security: Json[];
  paths: Record<string, Record<string, Json>>;
  components: { schemas: Record<string, Json>; securitySchemes: Json };
  tags: Array<{ name: string }>;
};

const methods = ['get', 'post', 'put', 'patch', 'delete'];
const operations = Object.entries(document.paths).flatMap(([path, byMethod]) =>
  Object.entries(byMethod).map(([method, operation]) => ({ path, method, operation })),
);

function collectRefs(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const entry of value) collectRefs(entry, found);
  } else if (value !== null && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (key === '$ref' && typeof entry === 'string') found.push(entry);
      else collectRefs(entry, found);
    }
  }
  return found;
}

describe('OpenAPI document', () => {
  test('is an OpenAPI 3.1 document that declares bearer authentication', () => {
    expect(document.openapi).toBe('3.1.0');
    expect(document.info.version).toBe(API_VERSION);
    expect(document.security).toEqual([{ bearerAuth: [] }]);
    expect(document.components.securitySchemes).toEqual({
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    });
  });

  test('every operation has a unique id, a declared tag, and a success response', () => {
    const ids = operations.map(({ operation }) => operation.operationId);
    const tags = new Set(document.tags.map((tag) => tag.name));

    expect(new Set(ids).size).toBe(ids.length);
    for (const { path, method, operation } of operations) {
      expect(methods).toContain(method);
      expect(typeof operation.summary).toBe('string');
      expect(tags.has((operation.tags as string[])[0] as string)).toBe(true);
      const statuses = Object.keys(operation.responses as Json);
      expect(statuses.some((status) => status.startsWith('2'))).toBe(true);
      expect(path.startsWith('/')).toBe(true);
    }
  });

  test('every $ref points at a schema in the document', () => {
    const refs = collectRefs(document);

    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      const name = ref.replace('#/components/schemas/', '');
      expect(document.components.schemas[name]).toBeDefined();
    }
  });

  test('public operations opt out of authentication and the others state their roles', () => {
    const open = operations.filter(({ operation }) => Array.isArray(operation.security));

    expect(open.map(({ path }) => path).sort()).toEqual([
      '/auth/login',
      '/health',
      '/health/ready',
    ]);
    for (const { operation } of operations) {
      expect(String(operation.description)).toMatch(
        /Public\.|Any signed-in user\.|Requires one of the roles/,
      );
    }
  });

  test('path parameters are declared for every templated path', () => {
    for (const { path, operation } of operations) {
      const names = [...path.matchAll(/\{(\w+)\}/g)].map((match) => match[1] as string);
      const declared = ((operation.parameters ?? []) as Array<{ name: string; in: string }>)
        .filter((parameter) => parameter.in === 'path')
        .map((parameter) => parameter.name);

      expect(declared.sort()).toEqual(names.sort());
    }
  });

  test('request bodies come from the schemas the API validates with', () => {
    const create = document.components.schemas.CreateItemRequest as {
      required: string[];
      properties: Record<string, Json>;
    };

    expect(create.required).toEqual(['name', 'priceCents']);
    expect(create.properties.priceCents).toMatchObject({ type: 'integer', minimum: 0 });
    expect(document.components.schemas.CreateCounterOrderRequest).toBeDefined();
  });

  test('error responses share one envelope', () => {
    const responses = (document.paths['/orders/{id}/close']?.post?.responses ?? {}) as Json;
    const conflict = responses['409'] as {
      content: { 'application/json': { schema: Json } };
    };

    expect(conflict.content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/Error',
    });
  });
});

describe('the document and the running API agree', () => {
  const app = createApp(createTestContainer({ API_DOCS_ENABLED: 'true' }));
  const registered = app.routes
    .filter((route) => route.method !== 'ALL')
    .map((route) => `${route.method.toLowerCase()} ${route.path.replace(/:(\w+)/g, '{$1}')}`)
    .filter((entry) => !/ \/(docs|openapi\.json)$/.test(entry));
  const documented = documentedOperations.map(
    (operation) => `${operation.method} ${operation.path}`,
  );

  test('every route the API registers is documented', () => {
    expect(documented.sort()).toEqual([...new Set(registered)].sort());
  });
});

describe('documented responses match what the API returns', () => {
  const now = new Date('2026-01-01T12:00:00.000Z');
  const user = User.create({
    id: new UserID('1'),
    name: 'Ada',
    email: 'ada@example.com',
    passwordHash: 'hash',
    roles: ['ADMIN', 'CASHIER'],
    now,
  });
  const item = Item.create({ id: new ItemID('1'), name: 'Coffee', priceCents: 750, now });
  const counter = Order.createCounter({
    id: new OrderID('1'),
    openedByUserId: user.id,
    lines: [{ item, quantity: 2 }],
    payments: [{ method: 'CASH', amountCents: 1500 }],
    now,
  });
  const table = Order.openTable({
    id: new OrderID('2'),
    openedByUserId: user.id,
    tableCode: 'T-1',
    now,
  });

  const accepts = (schema: z.ZodType, value: unknown) => schema.safeParse(value).success;

  test('users, items, and orders', () => {
    expect(accepts(userResponseSchema, toUserResponse(user))).toBe(true);
    expect(accepts(itemResponseSchema, toItemResponse(item))).toBe(true);
    expect(accepts(orderResponseSchema, toOrderResponse(counter))).toBe(true);
    expect(accepts(orderResponseSchema, toOrderResponse(table))).toBe(true);
  });

  test('pages and the login payload', () => {
    const page = toPageResponse([item], 1, 1, 20, toItemResponse);

    expect(accepts(pageOf(itemResponseSchema), page)).toBe(true);
    expect(
      accepts(loginResponseSchema, {
        accessToken: 'token',
        expiresAt: now.toISOString(),
        user: toUserResponse(user),
      }),
    ).toBe(true);
  });

  test('errors and health', () => {
    expect(
      accepts(errorResponseSchema, { error: { code: 'NOT_FOUND', message: 'No', requestId: 'r' } }),
    ).toBe(true);
    expect(accepts(healthResponseSchema, { status: 'ok' })).toBe(true);
  });

  test('a response that breaks the contract is caught', () => {
    expect(accepts(itemResponseSchema, { ...toItemResponse(item), priceCents: '750' })).toBe(false);
    expect(accepts(orderResponseSchema, { ...toOrderResponse(table), status: 'PAID' })).toBe(false);
  });
});

describe('API reference routes', () => {
  test('serve the contract and the Scalar page without authentication when enabled', async () => {
    const app = createApp(createTestContainer({ API_DOCS_ENABLED: 'true' }));

    const spec = await app.request('/openapi.json');
    const page = await app.request('/docs');

    expect(spec.status).toBe(200);
    expect(await spec.json()).toEqual(document);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(await page.text()).toContain('/openapi.json');
  });

  test('are absent when disabled', async () => {
    const app = createApp(createTestContainer({ API_DOCS_ENABLED: 'false' }));

    expect((await app.request('/openapi.json')).status).toBe(404);
    expect((await app.request('/docs')).status).toBe(404);
  });

  test('default to on outside production and off in production', async () => {
    const development = createApp(createTestContainer({ NODE_ENV: 'development' }));
    const production = createApp(createTestContainer({ NODE_ENV: 'production' }));

    expect((await development.request('/openapi.json')).status).toBe(200);
    expect((await production.request('/openapi.json')).status).toBe(404);
  });
});

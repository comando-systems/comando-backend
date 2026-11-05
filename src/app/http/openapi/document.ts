import { z } from 'zod';
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
  addOrderItemsBodySchema,
  changeOrderItemQuantityBodySchema,
  closeOrderBodySchema,
  createCounterOrderBodySchema,
  createItemBodySchema,
  createUserBodySchema,
  loginBodySchema,
  openTableOrderBodySchema,
  updateItemBodySchema,
  updateUserBodySchema,
} from '@/app/http/schemas';

type JsonObject = Record<string, unknown>;
export type OpenApiDocument = JsonObject;

export const API_VERSION = '0.1.0';

type Method = 'get' | 'post' | 'patch' | 'delete';
type Role = 'ADMIN' | 'CASHIER' | 'SERVER';

interface ParameterSpec {
  readonly name: string;
  readonly in: 'path' | 'query';
  readonly description: string;
  readonly required?: boolean;
  readonly schema: JsonObject;
}

interface OperationSpec {
  readonly method: Method;
  // OpenAPI style: `/orders/{id}`.
  readonly path: string;
  readonly operationId: string;
  readonly tag: string;
  readonly summary: string;
  readonly description?: string;
  // Omitted for any authenticated user; ignored for public operations.
  readonly roles?: readonly Role[];
  readonly public?: boolean;
  readonly parameters?: readonly ParameterSpec[];
  readonly request?: string;
  readonly success: {
    readonly status: number;
    readonly description: string;
    readonly schema: string;
  };
  readonly errors: readonly number[];
}

// Request bodies reuse the schemas the API validates with, so the contract cannot drift from them.
const requestSchemas: Readonly<Record<string, z.ZodType>> = {
  LoginRequest: loginBodySchema,
  CreateUserRequest: createUserBodySchema,
  UpdateUserRequest: updateUserBodySchema,
  CreateItemRequest: createItemBodySchema,
  UpdateItemRequest: updateItemBodySchema,
  CreateCounterOrderRequest: createCounterOrderBodySchema,
  OpenTableOrderRequest: openTableOrderBodySchema,
  AddOrderItemsRequest: addOrderItemsBodySchema,
  ChangeOrderItemQuantityRequest: changeOrderItemQuantityBodySchema,
  CloseOrderRequest: closeOrderBodySchema,
};

const responseSchemas: Readonly<Record<string, z.ZodType>> = {
  Error: errorResponseSchema,
  Health: healthResponseSchema,
  LoginResponse: loginResponseSchema,
  User: userResponseSchema,
  UserPage: pageOf(userResponseSchema),
  Item: itemResponseSchema,
  ItemPage: pageOf(itemResponseSchema),
  Order: orderResponseSchema,
  OrderPage: pageOf(orderResponseSchema),
};

const errorDescriptions: Readonly<Record<number, string>> = {
  400: 'The request is not valid. `error.details` lists the fields.',
  401: 'The access token is missing, invalid, or expired, or the user was deactivated.',
  403: 'The user has no role that allows this operation.',
  404: 'The resource does not exist or is not available.',
  409: 'The request conflicts with the current state of the resource.',
  429: 'Too many attempts. Wait for the time in the `Retry-After` header.',
  503: 'A dependency, such as the database, is not available.',
};

const idParameter = (name: string, description: string): ParameterSpec => ({
  name,
  in: 'path',
  description,
  required: true,
  schema: { type: 'string', pattern: '^[1-9]\\d*$' },
});

const pagination: readonly ParameterSpec[] = [
  {
    name: 'page',
    in: 'query',
    description: 'Page number, starting at 1.',
    schema: { type: 'integer', minimum: 1, default: 1 },
  },
  {
    name: 'pageSize',
    in: 'query',
    description: 'Items per page.',
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  },
];

const operations: readonly OperationSpec[] = [
  {
    method: 'get',
    path: '/health',
    operationId: 'getHealth',
    tag: 'Health',
    summary: 'Liveness check',
    public: true,
    success: { status: 200, description: 'The process is running.', schema: 'Health' },
    errors: [],
  },
  {
    method: 'get',
    path: '/health/ready',
    operationId: 'getReadiness',
    tag: 'Health',
    summary: 'Readiness check',
    description: 'Pings PostgreSQL.',
    public: true,
    success: { status: 200, description: 'The service can reach its database.', schema: 'Health' },
    errors: [503],
  },
  {
    method: 'post',
    path: '/auth/login',
    operationId: 'login',
    tag: 'Authentication',
    summary: 'Sign in',
    description:
      'Returns a short-lived access token. Rate limited per client address. Deactivated users cannot sign in.',
    public: true,
    request: 'LoginRequest',
    success: { status: 200, description: 'Signed in.', schema: 'LoginResponse' },
    errors: [400, 401, 429],
  },
  {
    method: 'post',
    path: '/users',
    operationId: 'createUser',
    tag: 'Users',
    summary: 'Create a user',
    roles: ['ADMIN'],
    request: 'CreateUserRequest',
    success: { status: 201, description: 'The user was created.', schema: 'User' },
    errors: [400, 401, 403, 409],
  },
  {
    method: 'get',
    path: '/users',
    operationId: 'listUsers',
    tag: 'Users',
    summary: 'List users',
    roles: ['ADMIN'],
    parameters: pagination,
    success: { status: 200, description: 'A page of users.', schema: 'UserPage' },
    errors: [400, 401, 403],
  },
  {
    method: 'get',
    path: '/users/{id}',
    operationId: 'getUser',
    tag: 'Users',
    summary: 'Read a user',
    roles: ['ADMIN'],
    parameters: [idParameter('id', 'User identifier.')],
    success: { status: 200, description: 'The user.', schema: 'User' },
    errors: [400, 401, 403, 404],
  },
  {
    method: 'patch',
    path: '/users/{id}',
    operationId: 'updateUser',
    tag: 'Users',
    summary: 'Update a user',
    description: 'Changes the name, email, password, or roles. Deactivated users cannot be edited.',
    roles: ['ADMIN'],
    parameters: [idParameter('id', 'User identifier.')],
    request: 'UpdateUserRequest',
    success: { status: 200, description: 'The updated user.', schema: 'User' },
    errors: [400, 401, 403, 404, 409],
  },
  {
    method: 'delete',
    path: '/users/{id}',
    operationId: 'deactivateUser',
    tag: 'Users',
    summary: 'Deactivate a user',
    description:
      'Users are never deleted. A deactivated user cannot sign in, and tokens already issued stop working at once because the user is reloaded on every request.',
    roles: ['ADMIN'],
    parameters: [idParameter('id', 'User identifier.')],
    success: { status: 200, description: 'The deactivated user.', schema: 'User' },
    errors: [400, 401, 403, 404, 409],
  },
  {
    method: 'post',
    path: '/items',
    operationId: 'createItem',
    tag: 'Items',
    summary: 'Create a catalog item',
    roles: ['ADMIN'],
    request: 'CreateItemRequest',
    success: { status: 201, description: 'The item was created.', schema: 'Item' },
    errors: [400, 401, 403],
  },
  {
    method: 'get',
    path: '/items',
    operationId: 'listItems',
    tag: 'Items',
    summary: 'List the catalog',
    description: 'Lists the active catalog, ordered by name.',
    parameters: [
      ...pagination,
      {
        name: 'includeRemoved',
        in: 'query',
        description: 'Also return items removed from the catalog.',
        schema: { type: 'boolean', default: false },
      },
    ],
    success: { status: 200, description: 'A page of items.', schema: 'ItemPage' },
    errors: [400, 401],
  },
  {
    method: 'get',
    path: '/items/{id}',
    operationId: 'getItem',
    tag: 'Items',
    summary: 'Read an item',
    parameters: [idParameter('id', 'Item identifier.')],
    success: { status: 200, description: 'The item.', schema: 'Item' },
    errors: [400, 401, 404],
  },
  {
    method: 'patch',
    path: '/items/{id}',
    operationId: 'updateItem',
    tag: 'Items',
    summary: 'Update an item',
    description: 'Existing orders keep the price they were created with.',
    roles: ['ADMIN'],
    parameters: [idParameter('id', 'Item identifier.')],
    request: 'UpdateItemRequest',
    success: { status: 200, description: 'The updated item.', schema: 'Item' },
    errors: [400, 401, 403, 404, 409],
  },
  {
    method: 'delete',
    path: '/items/{id}',
    operationId: 'removeItem',
    tag: 'Items',
    summary: 'Remove an item from the catalog',
    description: 'A soft removal: past orders keep their snapshot of the item.',
    roles: ['ADMIN'],
    parameters: [idParameter('id', 'Item identifier.')],
    success: { status: 200, description: 'The removed item.', schema: 'Item' },
    errors: [400, 401, 403, 404, 409],
  },
  {
    method: 'post',
    path: '/orders/counter',
    operationId: 'createCounterOrder',
    tag: 'Orders',
    summary: 'Create a counter order',
    description:
      'Creates the order with all its lines and persists it as `CLOSED` in one transaction. The server calculates the total, and the payments must add up to it exactly. A zero-total order needs no payments.',
    roles: ['CASHIER'],
    request: 'CreateCounterOrderRequest',
    success: { status: 201, description: 'The closed order.', schema: 'Order' },
    errors: [400, 401, 403, 404, 409],
  },
  {
    method: 'post',
    path: '/orders/table',
    operationId: 'openTableOrder',
    tag: 'Orders',
    summary: 'Open a table order',
    description: 'Only one open order can exist for a table at a time.',
    roles: ['SERVER'],
    request: 'OpenTableOrderRequest',
    success: { status: 201, description: 'The open order.', schema: 'Order' },
    errors: [400, 401, 403, 409],
  },
  {
    method: 'get',
    path: '/orders',
    operationId: 'listOrders',
    tag: 'Orders',
    summary: 'List order history',
    description: 'Newest first.',
    roles: ['CASHIER'],
    parameters: [
      ...pagination,
      {
        name: 'status',
        in: 'query',
        description: 'Filter by lifecycle state.',
        schema: { type: 'string', enum: ['OPEN', 'CLOSED', 'CANCELED'] },
      },
      {
        name: 'type',
        in: 'query',
        description: 'Filter by channel.',
        schema: { type: 'string', enum: ['COUNTER', 'TABLE'] },
      },
      {
        name: 'from',
        in: 'query',
        description: 'Only orders created at or after this instant.',
        schema: { type: 'string', format: 'date-time' },
      },
      {
        name: 'to',
        in: 'query',
        description: 'Only orders created at or before this instant.',
        schema: { type: 'string', format: 'date-time' },
      },
    ],
    success: { status: 200, description: 'A page of orders.', schema: 'OrderPage' },
    errors: [400, 401, 403],
  },
  {
    method: 'get',
    path: '/orders/{id}',
    operationId: 'getOrder',
    tag: 'Orders',
    summary: 'Read an order',
    roles: ['CASHIER'],
    parameters: [idParameter('id', 'Order identifier.')],
    success: { status: 200, description: 'The order.', schema: 'Order' },
    errors: [400, 401, 403, 404],
  },
  {
    method: 'post',
    path: '/orders/{id}/items',
    operationId: 'addOrderItems',
    tag: 'Orders',
    summary: 'Add items to an open table order',
    description: 'Adding an item that is already on the order increases the quantity of its line.',
    roles: ['SERVER'],
    parameters: [idParameter('id', 'Order identifier.')],
    request: 'AddOrderItemsRequest',
    success: { status: 200, description: 'The updated order.', schema: 'Order' },
    errors: [400, 401, 403, 404, 409],
  },
  {
    method: 'patch',
    path: '/orders/{id}/items/{itemId}',
    operationId: 'changeOrderItemQuantity',
    tag: 'Orders',
    summary: 'Set the quantity of a line',
    roles: ['SERVER'],
    parameters: [
      idParameter('id', 'Order identifier.'),
      idParameter('itemId', 'Identifier of the item on the line.'),
    ],
    request: 'ChangeOrderItemQuantityRequest',
    success: { status: 200, description: 'The updated order.', schema: 'Order' },
    errors: [400, 401, 403, 404, 409],
  },
  {
    method: 'post',
    path: '/orders/{id}/close',
    operationId: 'closeOrder',
    tag: 'Orders',
    summary: 'Close a table order',
    description:
      'Records the payments, which must add up to the total exactly. `CLOSED` is terminal.',
    roles: ['CASHIER', 'SERVER'],
    parameters: [idParameter('id', 'Order identifier.')],
    request: 'CloseOrderRequest',
    success: { status: 200, description: 'The closed order.', schema: 'Order' },
    errors: [400, 401, 403, 404, 409],
  },
  {
    method: 'post',
    path: '/orders/{id}/cancel',
    operationId: 'cancelOrder',
    tag: 'Orders',
    summary: 'Cancel a table order',
    description: '`CANCELED` is terminal.',
    roles: ['CASHIER', 'SERVER'],
    parameters: [idParameter('id', 'Order identifier.')],
    success: { status: 200, description: 'The canceled order.', schema: 'Order' },
    errors: [400, 401, 403, 404, 409],
  },
];

function toJsonSchema(schema: z.ZodType, io: 'input' | 'output'): JsonObject {
  const { $schema: _draft, ...rest } = z.toJSONSchema(schema, {
    io,
    unrepresentable: 'any',
  }) as JsonObject;

  return rest;
}

const ref = (name: string): JsonObject => ({ $ref: `#/components/schemas/${name}` });
const jsonContent = (name: string): JsonObject => ({
  'application/json': { schema: ref(name) },
});

function buildOperation(spec: OperationSpec): JsonObject {
  const rolesText =
    spec.public === true
      ? 'Public.'
      : spec.roles === undefined
        ? 'Any signed-in user.'
        : `Requires one of the roles: ${spec.roles.join(', ')}.`;

  const responses: Record<string, JsonObject> = {
    [String(spec.success.status)]: {
      description: spec.success.description,
      content: jsonContent(spec.success.schema),
    },
  };
  for (const status of spec.errors) {
    responses[String(status)] = {
      description: errorDescriptions[status] ?? 'Error.',
      content: jsonContent('Error'),
    };
  }

  return {
    operationId: spec.operationId,
    tags: [spec.tag],
    summary: spec.summary,
    description: [spec.description, rolesText].filter(Boolean).join('\n\n'),
    ...(spec.public === true ? { security: [] } : {}),
    ...(spec.roles === undefined ? {} : { 'x-roles': spec.roles }),
    ...(spec.parameters === undefined ? {} : { parameters: spec.parameters }),
    ...(spec.request === undefined
      ? {}
      : { requestBody: { required: true, content: jsonContent(spec.request) } }),
    responses,
  };
}

export function buildOpenApiDocument(): OpenApiDocument {
  const paths: Record<string, Record<string, JsonObject>> = {};
  for (const spec of operations) {
    paths[spec.path] = { ...paths[spec.path], [spec.method]: buildOperation(spec) };
  }

  const schemas: Record<string, JsonObject> = {};
  for (const [name, schema] of Object.entries(requestSchemas)) {
    schemas[name] = toJsonSchema(schema, 'input');
  }
  for (const [name, schema] of Object.entries(responseSchemas)) {
    schemas[name] = toJsonSchema(schema, 'output');
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Comandô API',
      version: API_VERSION,
      description: [
        'Counter sales and table orders.',
        'Identifiers are decimal strings, money is integer cents, and timestamps are ISO 8601 in UTC.',
        'Protected operations need `Authorization: Bearer <accessToken>` from `POST /auth/login`.',
        'Errors share one envelope: `{ "error": { "code", "message", "details?", "requestId?" } }`.',
      ].join('\n\n'),
    },
    servers: [{ url: '/' }],
    tags: [
      { name: 'Health', description: 'Liveness and readiness.' },
      { name: 'Authentication', description: 'Sign in.' },
      { name: 'Users', description: 'User administration (ADMIN).' },
      { name: 'Items', description: 'The catalog.' },
      { name: 'Orders', description: 'Counter and table orders.' },
    ],
    security: [{ bearerAuth: [] }],
    paths,
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas,
    },
  };
}

// Used by tests that keep the document and the registered routes in step.
export const documentedOperations: readonly Pick<OperationSpec, 'method' | 'path'>[] = operations;

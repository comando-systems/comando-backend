import { z } from 'zod';
import {
  errorResponseSchema,
  healthResponseSchema,
  itemResponseSchema,
  loginResponseSchema,
  orderResponseSchema,
  pageOf,
  salesSummaryResponseSchema,
  settingsResponseSchema,
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
  setOrderPricingBodySchema,
  updateItemBodySchema,
  updateSettingsBodySchema,
  updateUserBodySchema,
} from '@/app/http/schemas';

type JsonObject = Record<string, unknown>;
export type OpenApiDocument = JsonObject;

export const API_VERSION = '0.1.0';

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
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
  UpdateSettingsRequest: updateSettingsBodySchema,
  CreateItemRequest: createItemBodySchema,
  UpdateItemRequest: updateItemBodySchema,
  CreateCounterOrderRequest: createCounterOrderBodySchema,
  OpenTableOrderRequest: openTableOrderBodySchema,
  AddOrderItemsRequest: addOrderItemsBodySchema,
  ChangeOrderItemQuantityRequest: changeOrderItemQuantityBodySchema,
  CloseOrderRequest: closeOrderBodySchema,
  SetOrderPricingRequest: setOrderPricingBodySchema,
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
  Settings: settingsResponseSchema,
  SalesSummary: salesSummaryResponseSchema,
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
    description:
      'Changes the name, email, password (8 to 128 characters), or roles. `isActive: true` reactivates a deactivated user, which is the only edit a deactivated user accepts; `isActive: false` deactivates. An administrator cannot deactivate or demote themselves, and the last active administrator cannot be removed (`CANNOT_DEACTIVATE_SELF`, `CANNOT_REMOVE_OWN_ADMIN`, `LAST_ADMIN`).',
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
      'Users are never deleted. A deactivated user cannot sign in, and tokens already issued stop working at once because the user is reloaded on every request. Same safeguards as `PATCH`.',
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
    description:
      'Ordered by category, then name. Administrators see disabled items too; everyone else sees only items that can be sold.',
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
    method: 'get',
    path: '/reports/summary',
    operationId: 'getSalesSummary',
    tag: 'Reports',
    summary: 'Sales summary for a range',
    description:
      'Orders closed in the range, the revenue, the average ticket, the payments by method, the orders canceled, and the orders still being served. Without parameters it covers today in UTC. Send `from` and `to` to use the shop day instead, in local time. The range cannot exceed 366 days.',
    roles: ['ADMIN'],
    parameters: [
      {
        name: 'from',
        in: 'query',
        description:
          'Start of the range, inclusive. Defaults to a day before `to`, or the start of today in UTC.',
        schema: { type: 'string', format: 'date-time' },
      },
      {
        name: 'to',
        in: 'query',
        description: 'End of the range, exclusive. Defaults to a day after `from`.',
        schema: { type: 'string', format: 'date-time' },
      },
    ],
    success: { status: 200, description: 'The summary.', schema: 'SalesSummary' },
    errors: [400, 401, 403],
  },
  {
    method: 'get',
    path: '/settings',
    operationId: 'getSettings',
    tag: 'Settings',
    summary: 'Read the settings',
    description: 'The service fee shows on every bill, so every signed-in user can read it.',
    success: { status: 200, description: 'The settings.', schema: 'Settings' },
    errors: [401],
  },
  {
    method: 'put',
    path: '/settings',
    operationId: 'updateSettings',
    tag: 'Settings',
    summary: 'Change the settings',
    description:
      'Turns the service fee on or off and sets its rate. The fee starts off. Orders keep the rate snapshotted when they were opened, so a change does not alter existing orders.',
    roles: ['ADMIN'],
    request: 'UpdateSettingsRequest',
    success: { status: 200, description: 'The updated settings.', schema: 'Settings' },
    errors: [400, 401, 403],
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
    description:
      'A table is occupied while its order is open or awaiting payment. Opening it again answers `409` with code `TABLE_OCCUPIED` and the existing order in `error.details.orderId`.',
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
    summary: 'List orders',
    description:
      'Newest first. Servers and cashiers may list the orders still being served (`OPEN`, `AWAITING_PAYMENT`) by passing `status` or `statuses` with only those values. Anything that can include a closed or canceled order is history and needs the cashier role.',
    roles: ['CASHIER', 'SERVER'],
    parameters: [
      ...pagination,
      {
        name: 'status',
        in: 'query',
        description: 'Filter by lifecycle state.',
        schema: { type: 'string', enum: ['OPEN', 'AWAITING_PAYMENT', 'CLOSED', 'CANCELED'] },
      },
      {
        name: 'statuses',
        in: 'query',
        description: 'Comma-separated statuses, such as `OPEN,AWAITING_PAYMENT`.',
        schema: { type: 'string' },
      },
      {
        name: 'tableCode',
        in: 'query',
        description: 'Only orders of this table.',
        schema: { type: 'string', maxLength: 64 },
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
    description: 'Servers can read an order only while it is open or awaiting payment.',
    roles: ['CASHIER', 'SERVER'],
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
    method: 'delete',
    path: '/orders/{id}/items/{itemId}',
    operationId: 'removeOrderItem',
    tag: 'Orders',
    summary: 'Remove a line from a table order',
    roles: ['SERVER'],
    parameters: [
      idParameter('id', 'Order identifier.'),
      idParameter('itemId', 'Identifier of the item on the line.'),
    ],
    success: { status: 200, description: 'The updated order.', schema: 'Order' },
    errors: [400, 401, 403, 404, 409],
  },
  {
    method: 'patch',
    path: '/orders/{id}/pricing',
    operationId: 'setOrderPricing',
    tag: 'Orders',
    summary: 'Set the adjustment or the service fee',
    description:
      'Sets or clears (`null`) a discount or surcharge, and switches the service fee. The server calculates the total: subtotal, then the adjustment, then the fee on the adjusted amount. Allowed while the order is open or awaiting payment.',
    roles: ['CASHIER', 'SERVER'],
    parameters: [idParameter('id', 'Order identifier.')],
    request: 'SetOrderPricingRequest',
    success: { status: 200, description: 'The updated order.', schema: 'Order' },
    errors: [400, 401, 403, 404, 409],
  },
  {
    method: 'post',
    path: '/orders/{id}/request-payment',
    operationId: 'requestOrderPayment',
    tag: 'Orders',
    summary: 'Hand a table order to the cashier',
    description:
      'Moves an open order with at least one line to `AWAITING_PAYMENT`. The lines are locked until the order is reopened or closed.',
    roles: ['CASHIER', 'SERVER'],
    parameters: [idParameter('id', 'Order identifier.')],
    success: { status: 200, description: 'The order awaiting payment.', schema: 'Order' },
    errors: [400, 401, 403, 404, 409],
  },
  {
    method: 'post',
    path: '/orders/{id}/reopen',
    operationId: 'reopenOrder',
    tag: 'Orders',
    summary: 'Return an order awaiting payment to open',
    roles: ['CASHIER', 'SERVER'],
    parameters: [idParameter('id', 'Order identifier.')],
    success: { status: 200, description: 'The open order.', schema: 'Order' },
    errors: [400, 401, 403, 404, 409],
  },
  {
    method: 'post',
    path: '/orders/{id}/close',
    operationId: 'closeOrder',
    tag: 'Orders',
    summary: 'Close a table order',
    description:
      'Closes an order that is open or awaiting payment. The payments must add up to the total exactly, including the service fee. For cash, send `receivedCents` and the server derives the change. `CLOSED` is terminal.',
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
    description: 'Cancels an order that is open or awaiting payment. `CANCELED` is terminal.',
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
      { name: 'Reports', description: 'Sales figures for administrators.' },
      { name: 'Settings', description: 'Application settings (the service fee).' },
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

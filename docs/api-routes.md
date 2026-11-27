# API routes

Conventions: all IDs are decimal strings; money is integer cents; timestamps are ISO 8601 UTC. Protected routes require `Authorization: Bearer <accessToken>`. `Any` means any signed-in user. Optional fields end in `?`; `A[]` is an array of alias `A`; `Page<A>` is defined below.

Primitives:

- `Id`: `string` (`^[1-9]\d*$`)
- `Timestamp`: `string` (ISO 8601 UTC)
- `Cents`: `integer`
- `Role`: `"ADMIN"`, `"CASHIER"`, `"SERVER"`
- `OrderType`: `"COUNTER"`, `"TABLE"`
- `OrderStatus`: `"OPEN"`, `"AWAITING_PAYMENT"`, `"CLOSED"`, `"CANCELED"`
- `PaymentMethod`: `"CASH"`, `"DEBIT_CARD"`, `"CREDIT_CARD"`, `"PIX"`, `"OTHER"`

## Aliases

### Common

`Error`

```json
{
  "error": {
    "code": "string",
    "message": "string",
    "details": "unknown?",
    "requestId": "string?"
  }
}
```

- On `400`, `details` is `[{ "path": "string", "message": "string" }]`; `requestId` also comes in the `X-Request-Id` header.

`Health`

```json
{ "status": "'ok'" }
```

`Page<A>`

```json
{
  "data": "A[]",
  "pagination": {
    "page": "integer",
    "pageSize": "integer",
    "total": "integer",
    "totalPages": "integer"
  }
}
```

### Requests

`LoginRequest`

```json
{ "email": "string", "password": "string" }
```

`RefreshRequest`

```json
{ "refreshToken": "string" }
```

`CreateUserRequest`

```json
{
  "name": "string",
  "email": "string",
  "password": "string",
  "roles": "Role[]"
}
```

- Password 8-128 characters; at least one role.

`UpdateUserRequest`

```json
{
  "name": "string?",
  "email": "string?",
  "password": "string?",
  "roles": "Role[]?",
  "isActive": "boolean?"
}
```

- At least one field. `isActive: true` reactivates; `false` deactivates.

`CreateItemRequest`

```json
{
  "name": "string",
  "description": "string | null?",
  "category": "string?",
  "enabled": "boolean?",
  "priceCents": "Cents",
  "imageUrl": "string | null?"
}
```

- `priceCents >= 0`; `category` 1-80 characters.

`UpdateItemRequest`

```json
{
  "name": "string?",
  "description": "string | null?",
  "category": "string?",
  "enabled": "boolean?",
  "priceCents": "Cents?",
  "imageUrl": "string | null?"
}
```

- At least one field.

`OrderLineInput`

```json
{ "itemId": "Id", "quantity": "integer" }
```

- `quantity > 0`.

`PaymentInput`

```json
{
  "method": "PaymentMethod",
  "amountCents": "Cents",
  "receivedCents": "Cents?"
}
```

- `amountCents > 0`; `receivedCents` only with `method: "CASH"` and `>= amountCents`; change is derived by the server.

`CreateCounterOrderRequest`

```json
{
  "items": "OrderLineInput[]",
  "payments": "PaymentInput[]",
  "label": "string | null?",
  "surchargeCents": "Cents?",
  "discountCents": "Cents?",
  "applyServiceFee": "boolean?"
}
```

- At least one item; `payments` defaults to `[]`; amounts `>= 0`; payments must sum to the server-calculated total.

`OpenTableOrderRequest`

```json
{ "tableCode": "string" }
```

`AddOrderItemsRequest`

```json
{ "items": "OrderLineInput[]" }
```

- At least one item.

`ChangeQuantityRequest`

```json
{ "quantity": "integer" }
```

- `quantity > 0`.

`CloseOrderRequest`

```json
{ "payments": "PaymentInput[]" }
```

- Payments must sum to the total; `[]` is valid only for zero-total orders.

`SetPricingRequest`

```json
{
  "surchargeCents": "Cents | null?",
  "discountCents": "Cents | null?",
  "applyServiceFee": "boolean?"
}
```

- At least one field; `null` clears the amount to zero.

`UpdateSettingsRequest`

```json
{
  "serviceFeeEnabled": "boolean?",
  "serviceFeeBasisPoints": "integer?"
}
```

- At least one field; basis points 0-10000.

`PaginationQuery`

```json
{ "page": "integer?", "pageSize": "integer?" }
```

- Defaults: `page=1`, `pageSize=20`; `pageSize <= 100`.

`ItemListQuery`

```json
{
  "page": "integer?",
  "pageSize": "integer?",
  "includeRemoved": "'true' | 'false'?"
}
```

`OrderListQuery`

```json
{
  "page": "integer?",
  "pageSize": "integer?",
  "status": "OrderStatus?",
  "statuses": "string?",
  "tableCode": "string?",
  "type": "OrderType?",
  "from": "Timestamp?",
  "to": "Timestamp?"
}
```

- `statuses` is comma-separated; a filter including `CLOSED` or `CANCELED` needs history permission.

`DateRangeQuery`

```json
{ "from": "Timestamp?", "to": "Timestamp?" }
```

- `from` inclusive, `to` exclusive; range up to 366 days.

### Responses

`User`

```json
{
  "id": "Id",
  "name": "string",
  "email": "string",
  "roles": "Role[]",
  "isActive": "boolean",
  "createdAt": "Timestamp",
  "updatedAt": "Timestamp"
}
```

`Session`

```json
{
  "accessToken": "string",
  "expiresAt": "Timestamp",
  "refreshToken": "string",
  "refreshExpiresAt": "Timestamp",
  "user": "User"
}
```

- `accessToken` is the Bearer JWT; `refreshToken` is single-use.

`Item`

```json
{
  "id": "Id",
  "name": "string",
  "description": "string | null",
  "category": "string",
  "priceCents": "Cents",
  "imageUrl": "string | null",
  "enabled": "boolean",
  "isActive": "boolean",
  "createdAt": "Timestamp",
  "updatedAt": "Timestamp"
}
```

- `enabled` is the sellable switch; `isActive: false` means removed from the catalog.

`OrderItem`

```json
{
  "itemId": "Id",
  "itemName": "string",
  "quantity": "integer",
  "unitPriceCents": "Cents",
  "lineTotalCents": "Cents"
}
```

- `itemName` and `unitPriceCents` are snapshots from the time of ordering.

`OrderPayment`

```json
{
  "method": "PaymentMethod",
  "amountCents": "Cents",
  "receivedCents": "Cents | null",
  "changeCents": "Cents | null"
}
```

`Order`

```json
{
  "id": "Id",
  "type": "OrderType",
  "status": "OrderStatus",
  "tableCode": "string | null",
  "label": "string | null",
  "openedByUserId": "Id",
  "closedByUserId": "Id | null",
  "canceledByUserId": "Id | null",
  "paymentRequestedByUserId": "Id | null",
  "paymentRequestedAt": "Timestamp | null",
  "openedAt": "Timestamp",
  "closedAt": "Timestamp | null",
  "canceledAt": "Timestamp | null",
  "createdAt": "Timestamp",
  "updatedAt": "Timestamp",
  "version": "integer",
  "applyServiceFee": "boolean",
  "serviceFeeBasisPoints": "integer",
  "subtotalCents": "Cents",
  "surchargeCents": "Cents",
  "discountCents": "Cents",
  "serviceFeeCents": "Cents",
  "totalCents": "Cents",
  "items": "OrderItem[]",
  "payments": "OrderPayment[]"
}
```

- `totalCents = subtotal + surcharge - discount + service fee`; `version` increments on each change.

`Settings`

```json
{
  "serviceFeeEnabled": "boolean",
  "serviceFeeBasisPoints": "integer",
  "updatedAt": "Timestamp"
}
```

`SalesSummary`

```json
{
  "from": "Timestamp",
  "to": "Timestamp",
  "closedOrders": "integer",
  "revenueCents": "Cents",
  "averageTicketCents": "Cents",
  "canceledOrders": "integer",
  "openOrders": "integer",
  "byMethod": "PaymentTotal[]"
}
```

`PaymentTotal`

```json
{ "method": "PaymentMethod", "amountCents": "Cents" }
```

## Routes

Input notation: `path` = URL parameters, `query` = query string, `body` = JSON body. Errors are numeric HTTP statuses; all error bodies are `Error`. Unknown paths return `404`.

### Health and docs

| Method | Path | Roles | Input | Success | Errors | Rules |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/health` | Public | - | 200 `Health` | - | - |
| GET | `/health/ready` | Public | - | 200 `Health` | 503 | Pings the database. |
| GET | `/openapi.json` | Public | - | 200 `object` | - | Only when docs are enabled. |
| GET | `/docs` | Public | - | 200 `HTML` | - | Only when docs are enabled. |

### Authentication

| Method | Path | Roles | Input | Success | Errors | Rules |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/auth/login` | Public | body `LoginRequest` | 200 `Session` | 400, 401, 429 | Rate limited; disabled users cannot log in. |
| POST | `/auth/refresh` | Public | body `RefreshRequest` | 200 `Session` | 400, 401, 429 | Rotates the token; reuse revokes all the user's refresh tokens. |
| POST | `/auth/logout` | Public | body `RefreshRequest` | 204 empty | 400 | Idempotent. |

### Users

| Method | Path | Roles | Input | Success | Errors | Rules |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/users` | ADMIN | body `CreateUserRequest` | 201 `User` | 400, 401, 403, 409 | - |
| GET | `/users` | ADMIN | query `PaginationQuery` | 200 `Page<User>` | 400, 401, 403 | - |
| GET | `/users/:id` | ADMIN | path `Id` | 200 `User` | 400, 401, 403, 404 | - |
| PATCH | `/users/:id` | ADMIN | path `Id`, body `UpdateUserRequest` | 200 `User` | 400, 401, 403, 404, 409 | Cannot deactivate or demote self; cannot remove the last active admin. |
| DELETE | `/users/:id` | ADMIN | path `Id` | 200 `User` | 400, 401, 403, 404, 409 | Soft deactivation; issued tokens stop working immediately. |

### Items

| Method | Path | Roles | Input | Success | Errors | Rules |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/items` | ADMIN | body `CreateItemRequest` | 201 `Item` | 400, 401, 403 | - |
| GET | `/items` | Any | query `ItemListQuery` | 200 `Page<Item>` | 400, 401 | Non-admin sees only sellable items; `includeRemoved` applies only to ADMIN. |
| GET | `/items/:id` | Any | path `Id` | 200 `Item` | 400, 401, 404 | - |
| PATCH | `/items/:id` | ADMIN | path `Id`, body `UpdateItemRequest` | 200 `Item` | 400, 401, 403, 404, 409 | Existing orders keep their price. |
| DELETE | `/items/:id` | ADMIN | path `Id` | 200 `Item` | 400, 401, 403, 404, 409 | Soft removal; past orders keep the item snapshot. |

### Orders

| Method | Path | Roles | Input | Success | Errors | Rules |
| --- | --- | --- | --- | --- | --- | --- |
| POST | `/orders/counter` | ADMIN, CASHIER | body `CreateCounterOrderRequest` | 201 `Order` | 400, 401, 403, 404, 409 | Created as `CLOSED` in one transaction; server calculates totals. |
| POST | `/orders/table` | CASHIER, SERVER | body `OpenTableOrderRequest` | 201 `Order` | 400, 401, 403, 409 | Starts `OPEN`; occupied table gives 409 `TABLE_OCCUPIED` with `details.orderId`. |
| GET | `/orders` | Any | query `OrderListQuery` | 200 `Page<Order>` | 400, 401, 403 | `OPEN` / `AWAITING_PAYMENT` filters are allowed for SERVER; history needs ADMIN or CASHIER. |
| GET | `/orders/:id` | Any | path `Id` | 200 `Order` | 400, 401, 403, 404 | SERVER can read only live orders. |
| POST | `/orders/:id/items` | CASHIER, SERVER | path `Id`, body `AddOrderItemsRequest` | 200 `Order` | 400, 401, 403, 404, 409 | `OPEN` only; an existing item increases its line quantity. |
| PATCH | `/orders/:id/items/:itemId` | CASHIER, SERVER | path `Id`, `ItemId`, body `ChangeQuantityRequest` | 200 `Order` | 400, 401, 403, 404, 409 | `OPEN` only. |
| DELETE | `/orders/:id/items/:itemId` | CASHIER, SERVER | path `Id`, `ItemId` | 200 `Order` | 400, 401, 403, 404, 409 | `OPEN` only. |
| PATCH | `/orders/:id/pricing` | ADMIN, CASHIER, SERVER | path `Id`, body `SetPricingRequest` | 200 `Order` | 400, 401, 403, 404, 409 | `OPEN` or `AWAITING_PAYMENT`; fee rate is snapshotted on the order. |
| POST | `/orders/:id/request-payment` | CASHIER, SERVER | path `Id` | 200 `Order` | 400, 401, 403, 404, 409 | TABLE, `OPEN`, at least one line; locks the lines. |
| POST | `/orders/:id/reopen` | CASHIER, SERVER | path `Id` | 200 `Order` | 400, 401, 403, 404, 409 | `AWAITING_PAYMENT` back to `OPEN`. |
| POST | `/orders/:id/close` | ADMIN, CASHIER | path `Id`, body `CloseOrderRequest` | 200 `Order` | 400, 401, 403, 404, 409 | `OPEN` or `AWAITING_PAYMENT`; payments must sum to the total; `CLOSED` is terminal. |
| POST | `/orders/:id/cancel` | ADMIN, CASHIER, SERVER | path `Id` | 200 `Order` | 400, 401, 403, 404, 409 | `OPEN` or `AWAITING_PAYMENT`; `CANCELED` is terminal. |

### Reports and settings

| Method | Path | Roles | Input | Success | Errors | Rules |
| --- | --- | --- | --- | --- | --- | --- |
| GET | `/reports/summary` | ADMIN | query `DateRangeQuery` | 200 `SalesSummary` | 400, 401, 403 | Defaults to today in UTC. |
| GET | `/settings` | Any | - | 200 `Settings` | 401 | - |
| PUT | `/settings` | ADMIN | body `UpdateSettingsRequest` | 200 `Settings` | 400, 401, 403 | Existing orders keep the rate they were opened with. |

Other shared errors: `404` unknown route, `413` body too large, `429` rate limit, `500` internal error.

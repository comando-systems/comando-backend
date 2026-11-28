# HTTP API reference

This document lists every registered route with its inputs, outputs, and errors. The machine-readable contract is `/openapi.json`; the interactive reference is `/docs`. When behavior changes, update this file, `docs/api-routes.md`, and `src/app/http/openapi/document.ts` together.

## Conventions

- **Base URL:** the API itself (for example `http://localhost:3000`). All paths below are relative to it.
- **Content type:** `application/json` for requests and responses. The only bodyless response is `204` from `POST /auth/logout`.
- **Authentication:** `Authorization: Bearer <accessToken>` on every route marked "Authenticated". Tokens come from `POST /auth/login` or `POST /auth/refresh`.
- **Roles:** `ADMIN`, `CASHIER`, `SERVER`. Permissions are the union of a user's roles. A user is reloaded from the database on each authorized operation, so deactivation takes effect immediately, even for an unexpired token.
- **Identifiers:** positive integers serialized as decimal strings (for example `"42"`). Path and body IDs must match `^[1-9]\d*$`.
- **Money:** integer cents. `priceCents`, `amountCents`, `totalCents`, and similar fields are integers; floating-point values are rejected.
- **Timestamps:** ISO 8601 strings (`2026-01-01T12:00:00.000Z`).
- **Pagination:** list responses use `{ "data": [...], "pagination": { "page", "pageSize", "total", "totalPages" } }`. `page >= 1`, `1 <= pageSize <= 100`, defaults `1` and `20`.
- **Request IDs:** the API accepts `X-Request-Id` and always answers with it. Error bodies include the same value.
- **Limits:** request bodies above `BODY_LIMIT_BYTES` (default 1 MiB) are rejected. Login and refresh share an IP rate limit (`LOGIN_RATE_LIMIT_MAX` per `LOGIN_RATE_LIMIT_WINDOW_SECONDS`).

### Permission matrix

| Permission | ADMIN | CASHIER | SERVER |
|---|---|---|---|
| `users:manage`, `items:manage`, `settings:manage`, `reports:view` | yes | no | no |
| `orders:history` | yes | yes | no |
| `orders:counter` | no | yes | no |
| `orders:close`, `orders:cancel` | no | yes | yes |
| `orders:open`, `orders:update`, `orders:request-payment` | no | no | yes |

Live orders (`OPEN`, `AWAITING_PAYMENT`) are visible to any authenticated user who holds at least one of `orders:history`, `orders:open`, `orders:update`, or `orders:close`. Closed and canceled history requires `orders:history`.

## Errors

Every error has the same shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request",
    "details": [{ "path": "priceCents", "message": "Price cannot be negative" }],
    "requestId": "01J..."
  }
}
```

`details` is present only when the error carries field-level information; `requestId` is present when one was assigned.

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Malformed JSON, invalid query/path/body, or an explicit validation failure (for example `From must be before To`). |
| 400 | `INVALID_VALUE` | A domain value invariant failed (negative price, non-positive quantity, invalid payment method, discount above subtotal plus surcharge, and so on). |
| 401 | `UNAUTHORIZED` | Missing, malformed, expired, or invalid access token; disabled user; invalid credentials; invalid/expired/reused refresh token. |
| 403 | `FORBIDDEN` | The user is active but lacks the permission required by the use case. |
| 404 | `NOT_FOUND` | Unknown route, user, item, or order; an order line refers to an unavailable item. |
| 409 | `CONFLICT` | Generic state conflict (closed item edited, already deactivated user, duplicate email, counter-only order changed). |
| 409 | `CANNOT_DEACTIVATE_SELF` | An administrator tried to deactivate themselves. |
| 409 | `CANNOT_REMOVE_OWN_ADMIN` | An administrator tried to remove their own `ADMIN` role. |
| 409 | `LAST_ADMIN` | The change would remove the last active administrator. |
| 409 | `TABLE_OCCUPIED` | Another active order with lines already holds this table name. |
| 409 | `INVARIANT_VIOLATION` | A domain invariant failed, such as payments not summing to the total. |
| 409 | `INVALID_STATE_TRANSITION` | The order's current status does not allow the requested action. |
| 413 | `PAYLOAD_TOO_LARGE` | Request body exceeds `BODY_LIMIT_BYTES`. |
| 429 | `TOO_MANY_REQUESTS` | Login/refresh rate limit exceeded. The `Retry-After` header gives the wait in seconds. |
| 500 | `INTERNAL_ERROR` | Unexpected failure. Details are logged, never returned. |
| 503 | `SERVICE_UNAVAILABLE` | `GET /health/ready` could not reach the database. |

## Shared response shapes

`User` (returned by all user routes and nested in a session):

```json
{
  "id": "1",
  "name": "Ada Lovelace",
  "email": "ada@example.com",
  "roles": ["ADMIN", "CASHIER"],
  "isActive": true,
  "createdAt": "2026-01-01T12:00:00.000Z",
  "updatedAt": "2026-01-01T12:00:00.000Z"
}
```

`Item`:

```json
{
  "id": "1",
  "name": "Espresso",
  "description": "Espresso curto",
  "category": "Cafés",
  "categories": ["Cafés", "Bebidas quentes", "Vegano"],
  "priceCents": 750,
  "imageUrl": "https://images.example.com/espresso.jpg",
  "enabled": true,
  "isActive": true,
  "createdAt": "2026-01-01T12:00:00.000Z",
  "updatedAt": "2026-01-01T12:00:00.000Z"
}
```

`category` is the primary label (the first element of `categories`, or `Uncategorized`). `enabled` is the sellable switch; `isActive: false` means the item was removed from the catalog.

`Order`:

```json
{
  "id": "10",
  "type": "TABLE",
  "status": "AWAITING_PAYMENT",
  "tableCode": "Mesa 4",
  "originalTableCode": "Mesa 4",
  "label": null,
  "openedByUserId": "2",
  "closedByUserId": null,
  "canceledByUserId": null,
  "paymentRequestedByUserId": "2",
  "paymentRequestedAt": "2026-01-01T12:30:00.000Z",
  "openedAt": "2026-01-01T12:00:00.000Z",
  "closedAt": null,
  "canceledAt": null,
  "createdAt": "2026-01-01T12:00:00.000Z",
  "updatedAt": "2026-01-01T12:30:00.000Z",
  "version": 2,
  "applyServiceFee": false,
  "serviceFeeBasisPoints": 1000,
  "subtotalCents": 1950,
  "surchargeCents": 0,
  "discountCents": 0,
  "serviceFeeCents": 0,
  "totalCents": 1950,
  "items": [
    {
      "itemId": "1",
      "itemName": "Espresso",
      "quantity": 2,
      "unitPriceCents": 750,
      "lineTotalCents": 1500
    }
  ],
  "payments": []
}
```

Order types are `COUNTER` and `TABLE`; statuses are `OPEN`, `AWAITING_PAYMENT`, `CLOSED`, `CANCELED`. Line prices and names are snapshots taken when the line was added. Payment methods are `CASH`, `DEBIT_CARD`, `CREDIT_CARD`, `PIX`, `OTHER`; a payment is `{ "method", "amountCents", "receivedCents", "changeCents" }`, with the last two `null` unless the method is `CASH`.

`Session`:

```json
{
  "accessToken": "eyJ...",
  "expiresAt": "2026-01-01T13:00:00.000Z",
  "refreshToken": "base64url...",
  "refreshExpiresAt": "2026-01-31T12:00:00.000Z",
  "user": { "id": "1", "name": "...", "email": "...", "roles": ["ADMIN"], "isActive": true, "createdAt": "...", "updatedAt": "..." }
}
```

`Settings`: `{ "serviceFeeEnabled": false, "serviceFeeBasisPoints": 1000, "updatedAt": "..." }` (1000 basis points = 10%).

`SalesSummary`:

```json
{
  "from": "2026-01-01T00:00:00.000Z",
  "to": "2026-01-02T00:00:00.000Z",
  "closedOrders": 3,
  "revenueCents": 5800,
  "averageTicketCents": 1933,
  "canceledOrders": 1,
  "openOrders": 2,
  "byMethod": [{ "method": "PIX", "amountCents": 5800 }]
}
```

## Health and documentation

| Route | Auth | Input | Success | Errors |
|---|---|---|---|---|
| `GET /health` | Public | none | `200` `{ "status": "ok" }` | — |
| `GET /health/ready` | Public | none | `200` `{ "status": "ok" }` when the database responds | `503 SERVICE_UNAVAILABLE` |
| `GET /openapi.json` | Public | none | `200` OpenAPI 3.1 document | `404` when docs are disabled |
| `GET /docs` | Public | none | `200` HTML interactive reference | `404` when docs are disabled |

Docs are enabled outside production by default and disabled in production unless `API_DOCS_ENABLED=true`. `404` on these paths uses the standard `NOT_FOUND` error body.

## Authentication

| Route | Auth | Request | Success | Errors |
|---|---|---|---|---|
| `POST /auth/login` | Public | `{ "email": string (required), "password": string (required) }` | `200` `Session` | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED` (bad credentials or disabled user), `429 TOO_MANY_REQUESTS` |
| `POST /auth/refresh` | Public | `{ "refreshToken": string (1-512 chars) }` | `200` a new `Session`; the presented token is revoked | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED` (invalid, expired, reused, or user disabled), `429 TOO_MANY_REQUESTS` |
| `POST /auth/logout` | Public | `{ "refreshToken": string (1-512 chars) }` | `204` with no body | `400 VALIDATION_ERROR`, `429 TOO_MANY_REQUESTS` |

Refresh tokens are single use. Reusing a rotated token revokes every refresh token of that user and answers `401`; a logout of an unknown token is a no-op.

## Users

All user routes require `users:manage` (ADMIN only).

| Route | Request | Success | Errors |
|---|---|---|---|
| `POST /users` | `{ "name": string (required), "email": string (required), "password": string (8-128), "roles": ["ADMIN"\|"CASHIER"\|"SERVER"] (at least one) }` | `201` `User` | `400 VALIDATION_ERROR`, `401`, `403`, `409 CONFLICT` (email already registered) |
| `GET /users` | Query: `page`, `pageSize` | `200` `Page<User>` | `400`, `401`, `403` |
| `GET /users/:id` | Path: decimal `id` | `200` `User` | `400`, `401`, `403`, `404` |
| `PATCH /users/:id` | At least one of `name`, `email`, `password` (8-128), `roles` (>= 1), `isActive` (boolean). Sending `isActive: true` reactivates. | `200` `User` | `400`, `401`, `403`, `404`, `409 CONFLICT` (deactivated user cannot be edited, duplicate email), `409 CANNOT_DEACTIVATE_SELF`, `409 CANNOT_REMOVE_OWN_ADMIN`, `409 LAST_ADMIN` |
| `DELETE /users/:id` | Path: decimal `id`. Soft-deactivation, never a physical delete. | `200` `User` with `isActive: false` | `400`, `401`, `403`, `404`, `409 CONFLICT` (already deactivated), `409 CANNOT_DEACTIVATE_SELF`, `409 LAST_ADMIN` |

## Items

`POST`, `PATCH`, and `DELETE /items` require `items:manage` (ADMIN). `GET` routes are available to any authenticated, active user.

| Route | Request | Success | Errors |
|---|---|---|---|
| `POST /items` | `{ "name": string (required, <= 160), "description": string\|null?, "category": string (1-80)?, "categories": string[]?, "priceCents": integer >= 0 (required), "imageUrl": string\|null?, "enabled": boolean? }` | `201` `Item` | `400 VALIDATION_ERROR`/`INVALID_VALUE`, `401`, `403` |
| `GET /items` | Query: `page`, `pageSize`, `includeRemoved=true\|false` (ADMIN only; ignored otherwise), `search` (1-100 chars, accent-insensitive over name, description, and primary category) | `200` `Page<Item>`, ordered by primary category, then name | `400`, `401` |
| `GET /items/:id` | Path: decimal `id` | `200` `Item` | `400`, `401`, `404` |
| `PATCH /items/:id` | At least one of the `POST` fields except that all are optional. `categories` replaces the whole set; the first entry becomes the primary `category`. | `200` `Item` | `400`, `401`, `403`, `404`, `409 CONFLICT` (removed item cannot be edited) |
| `DELETE /items/:id` | Path: decimal `id`. Soft removal. | `200` `Item` with `isActive: false` | `400`, `401`, `403`, `404`, `409 CONFLICT` (already removed) |
| `POST /items/:id/image` | `multipart/form-data` with field `file`: JPEG, PNG, or WebP, 1 byte to `IMAGE_MAX_BYTES` (default 5 MiB). Replaces a previous stored image. | `200` `Item` with the new `imageUrl` | `400 VALIDATION_ERROR` (bad body, type, or size), `401`, `403`, `404`, `409`, `503 SERVICE_UNAVAILABLE` when storage is not configured |
| `DELETE /items/:id/image` | Path: decimal `id`. Clears `imageUrl` and deletes a managed file; an external link is only cleared. | `200` `Item` with `imageUrl: null` | `400`, `401`, `403`, `404`, `409`, `503` |
| `GET /images/items/:filename` | Public. Server-generated filename; unsafe paths return `404`. | `200` image bytes with the matching `Content-Type` | `404 NOT_FOUND` |

`categories` accepts at most 8 unique names of 1-80 characters; uniqueness is case-insensitive. `category` alone is a shorthand for a single-element list. Non-admin callers see only items that are not removed and are enabled.

Image uploads are optional: `POST`/`PATCH /items` keep accepting an external `imageUrl`. Stored files live under `IMAGE_STORAGE_DIR` and are served from `${IMAGE_PUBLIC_BASE_URL}/items/`. The server generates the filename and validates the file signature, so a client-supplied filename or path is never used.

## Orders

A `POST` body line is `{ "itemId": positive id string, "quantity": positive integer }`. A payment input is `{ "method": "CASH"|"DEBIT_CARD"|"CREDIT_CARD"|"PIX"|"OTHER", "amountCents": positive integer, "receivedCents"?: positive integer (CASH only) }`. Counter orders are created directly as `CLOSED`; table orders start as `OPEN`.

| Route | Auth | Request | Success | Errors |
|---|---|---|---|---|
| `POST /orders/counter` | `orders:counter` | `{ "items": [line, ...] (>= 1), "payments": [payment, ...] (default []), "label": string\|null?, "surchargeCents": integer >= 0?, "discountCents": integer >= 0?, "applyServiceFee": boolean? }`. One transaction; prices are snapshotted. | `201` `Order` (`CLOSED`) | `400`, `401`, `403`, `404` (unavailable item), `409 INVALID_VALUE`/`INVARIANT_VIOLATION` (payments must sum to the total, invalid discount) |
| `POST /orders/table` | `orders:open` | `{ "tableCode"?: string (<= 64, blank/absent = unnamed) }`. Opening does not reserve the name. | `201` `Order` (`OPEN`) | `400`, `401`, `403` |
| `GET /orders` | See note below | Query: `page`, `pageSize`, `status`, `statuses` (comma-separated), `tableCode`, `type=COUNTER\|TABLE`, `from`, `to` (ISO dates). Without a status filter, requires `orders:history`. | `200` `Page<Order>` | `400 VALIDATION_ERROR` (bad enum/date, `from` after `to`), `401`, `403` |
| `GET /orders/:id` | Live orders: any live-view permission; history: `orders:history` | Path: decimal `id` | `200` `Order` | `400`, `401`, `403`, `404` |
| `POST /orders/:id/items` | `orders:update` | `{ "items": [line, ...] (>= 1) }`. Adding an existing line increases its quantity. | `200` `Order` | `400`, `401`, `403`, `404`, `409 INVALID_STATE_TRANSITION`/`INVARIANT_VIOLATION` |
| `PATCH /orders/:id/items/:itemId` | `orders:update` | `{ "quantity": positive integer }` | `200` `Order` | `400`, `401`, `403`, `404`, `409 INVALID_STATE_TRANSITION`/`INVARIANT_VIOLATION` |
| `DELETE /orders/:id/items/:itemId` | `orders:update` | Path params only | `200` `Order` | `400`, `401`, `403`, `404`, `409 INVALID_STATE_TRANSITION`/`INVARIANT_VIOLATION` |
| `PATCH /orders/:id/pricing` | `orders:update` or `orders:close` | At least one of `surchargeCents` (integer >= 0 or `null` to clear), `discountCents` (same), `applyServiceFee` (boolean). | `200` `Order` with recalculated total | `400`, `401`, `403`, `404`, `409 INVALID_VALUE`/`INVALID_STATE_TRANSITION` |
| `POST /orders/:id/request-payment` | `orders:request-payment` | none | `200` `Order` (`AWAITING_PAYMENT`) | `401`, `403`, `404`, `409 INVALID_STATE_TRANSITION` (order cannot wait for payment or has no items) |
| `POST /orders/:id/close` | `orders:close` | `{ "payments": [payment, ...] (default []) }` | `200` `Order` (`CLOSED`) | `400`, `401`, `403`, `404`, `409 CONFLICT` (only table orders, payments must sum to the total), `409 INVALID_STATE_TRANSITION` |
| `POST /orders/:id/cancel` | `orders:cancel` | none | `200` `Order` (`CANCELED`) | `401`, `403`, `404`, `409 INVALID_STATE_TRANSITION` |
| `POST /orders/:id/reopen` | `orders:request-payment` | none | `200` `Order` (`OPEN`) | `401`, `403`, `404`, `409 INVALID_STATE_TRANSITION` |

A named table is occupied only when an active order already has lines. When a line is added, changed, or removed, the use case locks the name and answers `409 TABLE_OCCUPIED` if another active order holds it. An unnamed table has no occupancy rule. On `CLOSED` or `CANCELED`, `tableCode` is cleared and `originalTableCode` keeps the name from opening.

All order mutations are transactional and recalculate the total inside the transaction. Concurrency is controlled with row locking or a version check; a concurrent conflict surfaces as a `409`.

## Reports

| Route | Auth | Request | Success | Errors |
|---|---|---|---|---|
| `GET /reports/summary` | `reports:view` (ADMIN) | Query: `from`, `to` (ISO dates, optional). Defaults to one UTC day; `to` is exclusive and the range cannot exceed 366 days. | `200` `SalesSummary` over `CLOSED` orders in the range, counting `CANCELED` and live orders separately | `400 VALIDATION_ERROR` (invalid or inverted dates, range over 366 days), `401`, `403` |

## Settings

| Route | Auth | Request | Success | Errors |
|---|---|---|---|---|
| `GET /settings` | Authenticated | none | `200` `Settings` | `401` |
| `PUT /settings` | `settings:manage` (ADMIN) | At least one of `serviceFeeEnabled` (boolean), `serviceFeeBasisPoints` (integer 0-10000) | `200` `Settings` | `400 VALIDATION_ERROR`, `401`, `403` |

The service fee starts disabled at 1000 basis points (10%). Each order snapshots the rate when it is opened or when the fee is toggled, so changing settings never changes existing orders.

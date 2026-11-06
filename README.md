# Comandô

Comandô is a counter and table-order management backend built with TypeScript and Bun.

The system uses one order model for both service channels. A counter order is created with all its items and payments and is persisted directly as `CLOSED`. A table order remains `OPEN` while the server adds or changes items, until a cashier closes it or a cashier or server cancels it.

## Main capabilities

- Authenticate users and authorize actions through roles.
- Support users with one or more roles: `ADMIN`, `CASHIER`, and `SERVER`.
- Manage users without physically deleting them.
- Manage catalog items.
- Create completed counter orders.
- Open, update, close, cancel, and query table orders.
- Preserve historical order prices and totals.
- Keep operational logs and relevant audit information.

## Roles

| Role | Permissions |
|---|---|
| `ADMIN` | Create and edit users; deactivate users; manage items and settings; run the till (counter orders, history, close, cancel, pricing). Cannot open or edit tables. |
| `CASHIER` | Create counter orders; view order history; open and edit tables; hand over, close, or cancel table orders. |
| `SERVER` | Open table orders; add items and update quantities; hand a table to the cashier; cancel table orders. Cannot close them. |

A user may have multiple roles. Effective permissions are the union of the permissions granted by their roles. Authorization must be enforced by the backend for every use case.

## HTTP API

All endpoints accept and return JSON. Identifiers are decimal strings, monetary values are integer cents, and timestamps use ISO 8601 UTC strings.

### Authentication

Protected endpoints require a bearer access token:

```http
Authorization: Bearer <access-token>
```

`POST /auth/login` is public and is rate limited per client IP. Successful logins return a short-lived access token, an opaque refresh token, and the current user profile.

```json
{
  "accessToken": "<jwt>",
  "expiresAt": "2026-01-01T12:15:00.000Z",
  "refreshToken": "<opaque>",
  "refreshExpiresAt": "2026-01-31T12:00:00.000Z",
  "user": {
    "id": "1",
    "name": "Ada Lovelace",
    "email": "ada@example.com",
    "roles": ["CASHIER"],
    "isActive": true,
    "createdAt": "2026-01-01T12:00:00.000Z",
    "updatedAt": "2026-01-01T12:00:00.000Z"
  }
}
```

Refresh tokens are single use. `POST /auth/refresh` returns a new access token and a new refresh token and revokes the one presented; presenting an already used token revokes every refresh token of that user, so keep only the latest one. Only a SHA-256 hash of each token is stored. Tokens expire after `REFRESH_TOKEN_TTL_SECONDS` (default 30 days, 1 hour to 90 days), end when the user is deactivated, and `POST /auth/logout` revokes one. See ADR-07.

Disabled users cannot log in, and already-issued tokens stop working because the actor is reloaded from the database on every authorized operation.

### API reference

The contract is an OpenAPI 3.1 document and the interactive reference is rendered with [Scalar](https://scalar.com):

| Path | What it serves |
|---|---|
| `GET /openapi.json` | The OpenAPI document. Import it into any client generator or API tool. |
| `GET /docs` | The interactive reference. Use **Authorize** with the `accessToken` from `POST /auth/login`. |

Both are public. They are on by default outside production and off in production; set `API_DOCS_ENABLED=true` or `false` to override.

The document is built in code (`src/app/http/openapi/`). Request bodies reuse the same `zod` schemas the API validates with, response schemas are checked against the real serializers in the tests, and a test fails when a registered route is missing from the document or the document lists a route that does not exist. When you add or change an endpoint, update `src/app/http/openapi/document.ts` in the same change.

### Endpoints

| Method | Path | Allowed roles | Description |
|---|---|---|---|
| `GET` | `/health` | Public | Liveness check. |
| `GET` | `/health/ready` | Public | Readiness check that pings PostgreSQL. |
| `POST` | `/auth/login` | Public | Authenticate and issue an access token and a refresh token. |
| `POST` | `/auth/refresh` | Public | Exchange a refresh token for a new session; the old token is revoked. |
| `POST` | `/auth/logout` | Public | Revoke a refresh token (idempotent, `204`). |
| `POST` | `/users` | `ADMIN` | Create a user. |
| `GET` | `/users` | `ADMIN` | List users with pagination. |
| `GET` | `/users/:id` | `ADMIN` | Read a user. |
| `PATCH` | `/users/:id` | `ADMIN` | Update name, email, password, or roles; `isActive: true` reactivates a user. |
| `DELETE` | `/users/:id` | `ADMIN` | Deactivate a user (soft delete). |
| `GET` | `/settings` | Authenticated | Read the service fee settings. |
| `PUT` | `/settings` | `ADMIN` | Turn the service fee on or off and set its rate. |
| `GET` | `/reports/summary` | `ADMIN` | Sales summary for a range: revenue, orders, average ticket, payments by method. |
| `POST` | `/items` | `ADMIN` | Create a catalog item. |
| `GET` | `/items` | Authenticated | List the active catalog. |
| `GET` | `/items/:id` | Authenticated | Read an active item. |
| `PATCH` | `/items/:id` | `ADMIN` | Update an item. |
| `DELETE` | `/items/:id` | `ADMIN` | Remove an item from the active catalog. |
| `POST` | `/orders/counter` | `ADMIN`, `CASHIER` | Create a completed counter order. |
| `POST` | `/orders/table` | `CASHIER`, `SERVER` | Open a table order. |
| `GET` | `/orders` | `ADMIN`, `CASHIER` (history); `CASHIER`, `SERVER` (open orders) | List orders with filters. |
| `GET` | `/orders/:id` | `ADMIN`, `CASHIER`; `SERVER` while the order is open | Read an order. |
| `POST` | `/orders/:id/items` | `CASHIER`, `SERVER` | Add items, incrementing existing lines. |
| `PATCH` | `/orders/:id/items/:itemId` | `CASHIER`, `SERVER` | Set an absolute line quantity. |
| `DELETE` | `/orders/:id/items/:itemId` | `CASHIER`, `SERVER` | Remove a line from an open table order. |
| `PATCH` | `/orders/:id/pricing` | `ADMIN`, `CASHIER`, `SERVER` | Set or clear the adjustment, or switch the service fee. |
| `POST` | `/orders/:id/request-payment` | `CASHIER`, `SERVER` | Hand an open table order to the cashier (`AWAITING_PAYMENT`). |
| `POST` | `/orders/:id/reopen` | `CASHIER`, `SERVER` | Return an order awaiting payment to `OPEN`. |
| `POST` | `/orders/:id/close` | `ADMIN`, `CASHIER` | Close a table order that is open or awaiting payment. |
| `POST` | `/orders/:id/cancel` | `ADMIN`, `CASHIER`, `SERVER` | Cancel an open table order. |

### Request examples

Create a counter order:

```json
{
  "items": [
    { "itemId": "1", "quantity": 2 },
    { "itemId": "2", "quantity": 1 }
  ],
  "payments": [
    { "method": "CASH", "amountCents": 1000 },
    { "method": "CREDIT_CARD", "amountCents": 1550 }
  ]
}
```

Open a table order:

```json
{ "tableCode": "T-01" }
```

Add items to an open table order:

```json
{ "items": [{ "itemId": "1", "quantity": 2 }] }
```

Change a line quantity:

```json
{ "quantity": 5 }
```

Close an order:

```json
{
  "payments": [
    { "method": "CASH", "amountCents": 1000 },
    { "method": "PIX", "amountCents": 2750 }
  ]
}
```

Payment methods are `CASH`, `DEBIT_CARD`, `CREDIT_CARD`, `PIX`, and `OTHER`.

### Catalog, settings, and users

Items have a `category` (default `Uncategorized`) and an `enabled` switch. A disabled item stays editable and visible to administrators, but cannot be sold: it is hidden from everyone else and cannot be added to an order. `isActive` still means "not removed from the catalog". The catalog is ordered by category, then name.

`GET /settings` and `PUT /settings` manage the service fee. It starts off, `serviceFeeBasisPoints` is 1000 (10%) by default, and an order keeps the rate it snapshotted, so changing the settings never alters existing orders.

Passwords need 8 to 128 characters. A deactivated user can only be edited by sending `isActive: true`. To avoid locking everyone out, an administrator cannot deactivate or demote themselves (`CANNOT_DEACTIVATE_SELF`, `CANNOT_REMOVE_OWN_ADMIN`) and the last active administrator cannot be removed (`LAST_ADMIN`); concurrent changes are serialized with a database lock.

### Sales summary

`GET /reports/summary` returns, for the orders closed in a range: `closedOrders`, `revenueCents`, `averageTicketCents` (rounded half up, zero when there are none), and `byMethod`. It also reports `canceledOrders` in the range and `openOrders`, the orders being served right now. The range is `from` (inclusive) to `to` (exclusive), at most 366 days. Without parameters it is today in UTC; to follow the shop's day, the client sends its own local day boundaries as ISO 8601 instants.

### Order workflow

A table order goes `OPEN` to `AWAITING_PAYMENT` when the server hands it to the cashier, who closes it with the payments. While it awaits payment the lines are locked and only the pricing can change; `reopen` returns it to `OPEN`. A table stays occupied while its order is open or awaiting payment, and opening it again answers `409 TABLE_OCCUPIED` with the existing order in `error.details.orderId`.

The server calculates every amount in integer cents: the subtotal, then an optional adjustment (a discount or surcharge, as basis points or cents), then the service fee on the adjusted amount, rounding half up. `totalCents` is the sum, and the fee rate is a snapshot taken when the order is opened or the fee is switched, so changing the settings later does not alter existing orders. The service fee starts switched off in the settings.

Request examples:

```json
{ "adjustment": { "type": "DISCOUNT", "mode": "PERCENT", "value": 1000 }, "applyServiceFee": true }
```

`PATCH /orders/:id/pricing`: `value` is basis points for `PERCENT` (1000 is 10%) and cents for `FIXED`; `"adjustment": null` clears it.

```json
{ "payments": [{ "method": "CASH", "amountCents": 2000, "receivedCents": 5000 }] }
```

`POST /orders/:id/close`: for cash the server derives the change (`changeCents`).

`POST /orders/counter` also accepts `label` (the customer name), `adjustment`, and `applyServiceFee`.

`GET /orders` accepts `statuses` (comma separated, such as `OPEN,AWAITING_PAYMENT`) and `tableCode`. Servers and cashiers may list orders that are still being served; anything that can include a closed or canceled order needs the history permission.

### Pagination and history filters

List endpoints accept `page` (default `1`) and `pageSize` (default `20`, maximum `100`) and return:

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 0,
    "totalPages": 0
  }
}
```

`GET /items` accepts `includeRemoved=true`. Only `ADMIN` sees removed items; the flag is ignored for other roles.

`GET /orders` accepts optional `status` (`OPEN`, `CLOSED`, `CANCELED`), `type` (`COUNTER`, `TABLE`), `from`, and `to` filters. Results are newest first.

### Errors

Errors use a stable shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request",
    "details": [{ "path": "items", "message": "At least one item is required" }],
    "requestId": "..."
  }
}
```

Common statuses are `400` for validation, `401` for missing or invalid authentication, `403` for insufficient permissions, `404` for missing resources, `409` for invalid state transitions or conflicts, `413` for payloads above `BODY_LIMIT_BYTES`, and `429` when the login rate limit is exceeded.

CORS is controlled by `CORS_ORIGIN`, request payloads by `BODY_LIMIT_BYTES`, and login attempts by `LOGIN_RATE_LIMIT_MAX` and `LOGIN_RATE_LIMIT_WINDOW_SECONDS`.


## Order lifecycle

`Order` is a single domain concept. `OrderType` identifies the service channel and `OrderStatus` identifies the lifecycle state.

### Counter order (`COUNTER`)

1. A cashier submits the complete list of items, quantities, and payments.
2. The backend validates the request, calculates all monetary values, and checks that payments sum to the order total.
3. The order, its lines, and its payments are persisted atomically with status `CLOSED`.
4. The order is available in history.

A counter order must never be persisted as `OPEN`.

### Table order (`TABLE`)

1. A server opens an order with status `OPEN`.
2. While open, the server can add items and change quantities.
3. A cashier or server can cancel the order, changing its status to `CANCELED`.
4. A cashier (or an administrator) can close the order with its payment methods and amounts, changing its status to `CLOSED`.

`CLOSED` and `CANCELED` are terminal states in the initial scope. No edits or reopening are allowed after either state.

### Order items

The same catalog item can appear only once in a given order. Adding the same item again must update the existing line quantity instead of inserting another line.

The pair `(order_id, item_id)` is therefore the identity of an order line and is enforced as its composite primary key in PostgreSQL. The domain may represent it with an `OrderItemKey` / `ItemOrderKey` Value Object containing `OrderID` and `ItemID`.

Each line stores a snapshot of the unit price used at the time of the order. Changing the current catalog price must never change historical orders. The order total is calculated by the backend from line snapshots and quantities.

## Domain model

The initial model includes:

- `User`, `UserID`, and role assignments.
- `Item`, `ItemID`, and `Money`.
- `Order`, `OrderID`, `OrderType`, and `OrderStatus`.
- `OrderItem`, identified by `OrderItemKey` (`OrderID` + `ItemID`).
- `OrderPayment` and `PaymentMethod` for closed-order payments.
- `ValueObject<T>` and typed `ID<T>` abstractions.
- Specific repository contracts for domain entities.

`Money` uses integer minor units (cents). Do not use floating-point arithmetic for monetary calculations.

Users are deactivated/soft-deleted and must remain available for historical references. Items can be removed from the active catalog, but historical order lines must remain intact. The initial database migration uses `deleted_at` for soft removal and restrictive foreign keys to protect referenced records.

## Project organization

The codebase is organized by responsibility, not by repeating a complete set of layers inside every feature module.

```text
src/
  app/
    use-cases/
    http/
    container/
    config/
  domain/
    entity/
    types/
    value-objects/
    repository/
    errors/
  infrastructure/
    database/
    repositories/
    authentication/
    logging/
  index.ts
migrations/
  001_initial_schema.up.sql
  001_initial_schema.down.sql
  002_order_payments.up.sql
  002_order_payments.down.sql
tests/
  unit/
  integration/
  e2e/
```

### `app`

Contains application use cases and orchestration. It coordinates domain objects and repository contracts, applies authorization policies, and defines transaction boundaries. HTTP route handlers and request validation may live under `app/http`; there is no separate `presentation` layer.

### `domain`

Contains business concepts and rules: entities, Value Objects, IDs, enums, DTOs used as domain contracts where appropriate, repository interfaces, and domain errors. Keep domain code independent from Bun HTTP APIs, database clients, JWT libraries, and environment variables.

Use `domain/entity` for entities and closely related domain DTOs. Use `domain/types` for shared domain types and enums when they are not small enough to live in the relevant public `index.ts`. Avoid creating files or folders that add no useful separation.

### `infrastructure`

Contains technical implementations: database connection and transaction adapters, concrete repositories, JWT signing/verification, password hashing, structured logging, and external integrations.

Database migrations are maintained as SQL files outside the TypeScript runtime source. The migration files in this package are a PostgreSQL starting schema and can be run by the migration tool selected for the project.

### Public module entry points

Expose a module's public API through its root `index.ts`. Consumers should import from the public entry point rather than internal file paths.

```typescript
import { Item, ItemID, ItemRepository } from "@/domain/entity/item";
```

For a small number of closely related types or enums, export them from the same `index.ts` rather than creating a `types.ts` automatically. Create `types.ts` only when it improves cohesion or readability. Internal files may use direct relative imports when needed to avoid circular barrel imports.

## Persistence and identifiers

PostgreSQL is used by the supplied SQL migrations. Every standalone surrogate primary key uses:

```sql
BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY
```

`OrderItem` is the intentional exception: its primary key is composite (`order_id`, `item_id`) because the domain guarantees one line per catalog item per order. Both referenced entity IDs are identity-generated in their own tables.

The migration includes foreign keys, checks, indexes, role seeds, soft-delete columns, price snapshots, payment storage, and audit/refresh-token storage foundations. Apply migrations through a migration runner or a controlled deployment process; do not execute schema changes ad hoc in application startup.

The API receives separate `DATABASE_READ_URL` and `DATABASE_WRITE_URL` connections. Both currently point to the same PostgreSQL instance; repositories use the read connection for queries and the write connection for mutations and transactions.

All SQL runs through the first-party `SqlClient` adapter in `src/infrastructure/database`, which wraps Bun's native SQL client. Repositories do not import or depend on a third-party database driver. Transactions are scoped with `AsyncLocalStorage`, so singleton repositories automatically use the active transaction.

Apply migrations from the root `migrations/` directory in ascending order. Do not execute schema changes ad hoc during application startup. The `docker-compose.yml` migration service mounts that directory.

## Configuration

Validate the environment at startup. Required variables include `DATABASE_READ_URL`, `DATABASE_WRITE_URL`, and a `JWT_SECRET` with at least 32 characters. See `.env.example` for the complete list and defaults. Secrets must never be committed or logged.

| Variable | Default | Notes |
| --- | --- | --- |
| `NODE_ENV` | `development` | `production` turns HSTS on, the API docs off, and requires explicit CORS origins. |
| `JWT_EXPIRES_IN_SECONDS` | `900` | Access token lifetime (60 to 86400). |
| `REFRESH_TOKEN_TTL_SECONDS` | `2592000` | Refresh token lifetime (1 hour to 90 days). |
| `CORS_ORIGIN` | `*` | Comma separated origins. `*` is rejected in production, so the API refuses to start with it. |
| `LOGIN_RATE_LIMIT_MAX`, `LOGIN_RATE_LIMIT_WINDOW_SECONDS` | `10`, `60` | Applies to login and refresh, per client IP. |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, or `error`. |
| `API_DOCS_ENABLED` | on outside production | Serves `/docs` and `/openapi.json`. |

An invalid or missing variable stops the process at startup with the list of problems, before it opens a port. Migrations are never applied by the API itself: run `bun run docker:migrate` (or your deployment's migration step) first.

## Authentication, security, and logging

- Store password hashes only; never store plaintext passwords.
- Use a modern password hashing algorithm such as Argon2id. Check the current Bun API and library support before implementation.
- Use short-lived signed JWT access tokens. Validate signature, expiry, issuer/audience when configured, and required claims.
- Keep signing secrets in validated environment configuration, never in source control.
- If refresh tokens are used, store only their hashes and support rotation and revocation.
- Never log passwords, hashes, JWTs, refresh tokens, authorization headers, or secrets.
- Use structured logs with request/correlation IDs.
- Keep technical logs separate from persistent audit events.
- Apply authorization in use cases, not only in HTTP handlers.
- Every API response (including errors) sends `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and a restrictive `Permissions-Policy`. In production it also sends `Strict-Transport-Security`. The documentation page (`/docs`) is exempt from the CSP and cache headers because it loads its own assets. The API authenticates with a Bearer header, never cookies, so there is no CSRF surface.
- Errors that are not expected answer a generic `500` with the request id; the cause is logged, with credentials redacted.

### Audit events

Administrative and order lifecycle actions write a row to `audit_logs` in the same transaction as the action, so a rolled back action leaves no trace and a committed one always does. Each row has the actor, an `action`, the target type and id, the request id of the call (the `X-Request-Id` response header, also present in the request log), and a small `metadata` object that never holds credentials or tokens.

| Action | When |
| --- | --- |
| `user.create`, `user.update`, `user.deactivate` | User administration. |
| `item.create`, `item.update`, `item.remove` | Catalog administration. |
| `settings.update` | Service fee settings change. |
| `order.counter.create`, `order.table.open`, `order.pricing.set`, `order.payment.request`, `order.reopen`, `order.close`, `order.cancel` | Order lifecycle. Line edits are not audited. |
| `auth.refresh.reuse` | A rotated refresh token was presented again; all of that user's tokens were revoked. |

## Transactions and consistency

Use transactions for counter-order creation, table-order creation, line changes, closing, and cancellation. Recalculate the total inside the same transaction as line mutations. Use row locking or optimistic concurrency control to prevent lost updates when multiple requests modify one open order.

## Quality

- Use TypeScript strict mode.
- Keep files focused and avoid speculative abstractions.
- Test domain rules independently from HTTP and persistence.
- Test repository mappings, constraints, migrations, and transaction rollback.
- Test all role permissions and order state transitions.
- Keep API errors stable and avoid exposing internal exception details.

Run the checks with:

```bash
bun run format:check
bun run lint
bun run typecheck
bun test tests/unit
TEST_DATABASE_URL=postgres://comando:comando@localhost:55432/comando_test?sslmode=disable bun test tests/integration
TEST_DATABASE_URL=postgres://comando:comando@localhost:55432/comando_test?sslmode=disable bun test tests/e2e
```

## Local development and Docker

All Docker files live in `infra/` (see `infra/README.md`). Copy `.env.example` to `.env`, then:

```bash
bun install
bun run docker:db        # PostgreSQL
bun run docker:migrate   # apply migrations
bun run db:create-admin  # first administrator (ADMIN_EMAIL, ADMIN_PASSWORD)
bun run dev              # API with hot reload
```

`bun run docker:up` starts the whole stack (PostgreSQL, migrations, API, nginx) the way it runs in deployment.

## Testing and CI

| Command | What it runs |
|---|---|
| `bun run test` | Unit tests |
| `bun run test:integration` | Repositories, constraints, and use cases (needs `TEST_DATABASE_URL`) |
| `bun run test:e2e` | API tests against the real app and database (needs `TEST_DATABASE_URL`) |
| `bun run test:coverage` | Everything, with the 95% minimum for lines and functions |
| `bun run lint`, `bun run typecheck` | Biome and TypeScript |

Use a separate database for tests; the helpers truncate tables. Heavy tests, such as the k6 load test (`k6/load-test.js`, budget p95 < 500 ms and p99 < 1 s), run only on GitHub Actions.

GitHub Actions runs every check on each pull request and reports them through the single `CI Gate` job: lint and types, commit messages, PR title, unit, integration, API tests, coverage, migrations up/down, production build and smoke test, Docker image, load test, and secret and dependency scans. Commit messages and PR titles follow Conventional Commits, enforced locally by Husky and commitlint.

### Capacity test

The `Capacity` workflow (Actions, manual) answers "how many people can use this at once?" with a measurement. It starts the production build and holds 25, 50, 100, 200, 400, and 800 concurrent users (editable) for 60 seconds each. A user loops through listing items, listing orders, and ringing up a counter sale, pausing about a second between actions; sign-ins run at a steady rate. Every step reports avg, p90, p95, p99, and max per endpoint, and the run stops at the first step where an endpoint breaks p95 < 500 ms, p99 < 1 s, or 1% failures. The summary names the highest step that stayed within the budget.

Last measurement (2026-11-06, GitHub-hosted runner, workflow run 42207150069): 600 concurrent users (about 600 requests/s) stayed well inside the budget (`GET /orders` p95 95 ms, p99 144 ms; sale creation p95 64 ms, p99 88 ms; sign-in p99 155 ms; no failures). At 800 users the runner saturated at about 660 requests/s and `GET /orders` reached p95 517 ms, breaking the 500 ms budget. A first run exposed a connection pool deadlock under write load (fixed by drawing ids on the transaction's connection), so rerun the workflow after any change to the database layer.

Concurrent users are not registered users: with the think time above, a few hundred concurrent users stand for a much larger registered base. API, PostgreSQL, and the load generator share one CI runner, so the number is a conservative floor for a dedicated server.


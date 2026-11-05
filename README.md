# Comandô

Comandô is a counter and table-order management backend built with TypeScript and Bun.

The system uses one order model for both service channels. A counter order is created with all its items and payments and is persisted directly as `CLOSED`. A table order remains `OPEN` while the server adds or changes items, until a cashier or server closes or cancels it.

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
| `ADMIN` | Create and edit users; deactivate users; create, edit, and remove items. |
| `CASHIER` | Create counter orders; view order history; close or cancel open table orders. |
| `SERVER` | Open table orders; add items and update quantities; close or cancel open table orders. |

A user may have multiple roles. Effective permissions are the union of the permissions granted by their roles. Authorization must be enforced by the backend for every use case.

## HTTP API

All endpoints accept and return JSON. Identifiers are decimal strings, monetary values are integer cents, and timestamps use ISO 8601 UTC strings.

### Authentication

Protected endpoints require a bearer access token:

```http
Authorization: Bearer <access-token>
```

`POST /auth/login` is public and is rate limited per client IP. Successful logins return a short-lived access token and the current user profile.

```json
{
  "accessToken": "<jwt>",
  "expiresAt": "2026-01-01T12:15:00.000Z",
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

Disabled users cannot log in, and already-issued tokens stop working because the actor is reloaded from the database on every authorized operation.

### Endpoints

| Method | Path | Allowed roles | Description |
|---|---|---|---|
| `GET` | `/health` | Public | Liveness check. |
| `GET` | `/health/ready` | Public | Readiness check that pings PostgreSQL. |
| `POST` | `/auth/login` | Public | Authenticate and issue an access token. |
| `POST` | `/users` | `ADMIN` | Create a user. |
| `GET` | `/users` | `ADMIN` | List users with pagination. |
| `GET` | `/users/:id` | `ADMIN` | Read a user. |
| `PATCH` | `/users/:id` | `ADMIN` | Update name, email, password, or roles. |
| `DELETE` | `/users/:id` | `ADMIN` | Deactivate a user (soft delete). |
| `POST` | `/items` | `ADMIN` | Create a catalog item. |
| `GET` | `/items` | Authenticated | List the active catalog. |
| `GET` | `/items/:id` | Authenticated | Read an active item. |
| `PATCH` | `/items/:id` | `ADMIN` | Update an item. |
| `DELETE` | `/items/:id` | `ADMIN` | Remove an item from the active catalog. |
| `POST` | `/orders/counter` | `CASHIER` | Create a completed counter order. |
| `POST` | `/orders/table` | `SERVER` | Open a table order. |
| `GET` | `/orders` | `CASHIER` | List order history with filters. |
| `GET` | `/orders/:id` | `CASHIER` | Read an order. |
| `POST` | `/orders/:id/items` | `SERVER` | Add items, incrementing existing lines. |
| `PATCH` | `/orders/:id/items/:itemId` | `SERVER` | Set an absolute line quantity. |
| `POST` | `/orders/:id/close` | `CASHIER`, `SERVER` | Close an open table order. |
| `POST` | `/orders/:id/cancel` | `CASHIER`, `SERVER` | Cancel an open table order. |

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
4. A cashier or server can close the order with its payment methods and amounts, changing its status to `CLOSED`.

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

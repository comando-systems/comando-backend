# Comandô

Restaurant order management API built with TypeScript, Bun, PostgreSQL, and
Bun SQL.

The API manages users and roles, products, service sessions (tables or counter),
consumed items, payments, and session closing. Business rules are enforced in
the application layer and backed by PostgreSQL constraints where practical.

## Requirements

- Bun 1.2+
- PostgreSQL 17 (or Docker Compose)

## Local setup

```bash
bun install
cp .env.example .env
# edit .env with your DATABASE_URL and JWT_SECRET

# create the schema once on an empty database
psql "$DATABASE_URL" -f .docker/database/script.sql

bun run db:seed
bun run dev
```

The API listens on `PORT` (default `8080`).

Useful environment variables:

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string used by the API |
| `JWT_SECRET` | yes | Secret used to sign bearer tokens |
| `PORT` | no | HTTP port, defaults to `8080` |
| `TOKEN_TTL_SECONDS` | no | Token lifetime, defaults to `28800` (8 hours) |
| `ADMIN_NAME` | no | Name for the initial administrator |
| `ADMIN_EMAIL` | no | Email for the initial administrator |
| `ADMIN_PASSWORD` | no | Password for the initial administrator (min. 8 chars) |

`bun run db:seed` always ensures the `ADMIN`, `CAIXA`, and `GARCOM` roles exist.
It also creates an administrator when `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set.

## Scripts

```bash
bun run dev           # start with hot reload
bun run check         # typecheck + import/layout checks
bun run typecheck     # bun check --no-script
bun run check:imports # enforce barrel imports and flat domain modules
bun test              # run the test suite
bun run build         # bundle the API
bun run db:seed       # ensure roles and optional administrator
```

## Database schema

The complete schema lives in `.docker/database/script.sql`, including enum
types, tables, constraints, indexes, and the default roles. PostgreSQL runs it
once when the Docker data volume is first initialized.

The script is not applied to an existing database. To recreate a development
database from scratch:

```bash
docker compose down -v
docker compose up -d --build
```

To apply the schema manually to an empty PostgreSQL database:

```bash
psql "$DATABASE_URL" -f .docker/database/script.sql
```

Schema changes are made directly in the script. For an existing database,
apply the equivalent SQL manually and keep the script as the source of truth.

## Project structure

```text
api/
  app/
    services/     # use cases (auth, users, products, sessions, payments)
  domain/
    money/        # monetary helpers
    users/        # flat domain modules
    roles/
    products/
    sessions/
    payments/
    repositories/ # repository implementations
  http/           # routes, middleware, server, validation, and responses
  test/           # fakes and shared test support
scripts/
  database/       # optional administrator seed
  check-imports.ts
.docker/
  database/       # PostgreSQL image and script.sql schema
```

Each `api/domain/<module>` directory stays flat and exposes its public API
through `index.ts`. Entities, types, enums, presenters, pure domain rules, and
the repository interface (`I<Entity>.repository.ts`) live directly in the
module. Repository classes live in `api/domain/repositories`, and use-case
services live in `api/app/services`.

Consumers import a module through its barrel (`@/domain/users`), never a deep
file. `scripts/check-imports.ts` rejects deep `@/domain/*` and
`@/app/services/*` imports, enforces an `index.ts` per domain module, and keeps
domain modules flat.

## Docker

```bash
cp .env.example .env
# set DB_PASS and a strong JWT_SECRET
docker compose up -d --build
```

Only nginx is published (`HTTP_PORT`, default `80`). The PostgreSQL container
loads `.docker/database/script.sql` on first initialization.

Optional bootstrap administrator:

```bash
docker compose --profile tools run --rm seed
```

## Authentication

`POST /auth/login` returns a bearer token:

```bash
curl -X POST http://localhost:8080/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@example.com","password":"secret123"}'
```

Send it on protected routes:

```bash
curl http://localhost:8080/auth/me \
  -H 'authorization: Bearer <token>'
```

Tokens are signed with HMAC-SHA256 and expire according to
`TOKEN_TTL_SECONDS`. Users are loaded from the database on every request, so
deactivating a user or changing roles takes effect immediately.

## Roles and permissions

Permissions are centralized in `api/domain/roles/permissions.ts`.

| Permission | ADMIN | CAIXA | GARCOM |
| --- | :---: | :---: | :---: |
| `users:manage` | ✓ | | |
| `products:read` | ✓ | ✓ | ✓ |
| `products:manage` | ✓ | | |
| `sessions:read` | ✓ | ✓ | ✓ |
| `sessions:open` | ✓ | ✓ | ✓ |
| `sessions:close` | ✓ | ✓ | |
| `sessions:cancel` | ✓ | | |
| `items:manage` | ✓ | ✓ | ✓ |
| `payments:read` | ✓ | ✓ | |
| `payments:create` | ✓ | ✓ | |

Users may have multiple roles; permissions are combined.

## Endpoints

| Method | Path | Permission | Description |
| --- | --- | --- | --- |
| `POST` | `/auth/login` | public | Authenticate and receive a token |
| `GET` | `/auth/me` | authenticated | Current user and roles |
| `PUT` | `/auth/password` | authenticated | Change own password |
| `GET` | `/users` | `users:manage` | List users with roles |
| `POST` | `/users` | `users:manage` | Create user |
| `GET` | `/users/:id` | `users:manage` | Get user |
| `PATCH` | `/users/:id` | `users:manage` | Update user |
| `DELETE` | `/users/:id` | `users:manage` | Deactivate user |
| `PUT` | `/users/:id/roles` | `users:manage` | Replace user roles |
| `GET` | `/roles` | `users:manage` | List roles |
| `GET` | `/products?active=` | `products:read` | List products |
| `POST` | `/products` | `products:manage` | Create product |
| `GET` | `/products/:id` | `products:read` | Get product |
| `PATCH` | `/products/:id` | `products:manage` | Update product |
| `DELETE` | `/products/:id` | `products:manage` | Deactivate product |
| `GET` | `/sessions?status=` | `sessions:read` | List sessions |
| `POST` | `/sessions` | `sessions:open` | Open table or counter session |
| `GET` | `/sessions/:id` | `sessions:read` | Session detail with items, payments, totals |
| `POST` | `/sessions/:id/close` | `sessions:close` | Close a fully paid session |
| `POST` | `/sessions/:id/cancel` | `sessions:cancel` | Cancel a session without payments |
| `GET` | `/sessions/:id/items` | `sessions:read` | List items, including removed ones |
| `POST` | `/sessions/:id/items` | `items:manage` | Add item using the current product price |
| `DELETE` | `/sessions/:id/items/:itemId` | `items:manage` | Mark item as removed (audited) |
| `GET` | `/sessions/:id/payments` | `payments:read` | List session payments |
| `POST` | `/sessions/:id/payments` | `payments:create` | Register a partial payment |

### Money representation

The API accepts and returns monetary values as integer cents:

```json
{ "name": "Pizza", "priceCents": 4590 }
```

Payments use `amountCents`. Session totals use `itemsCents`, `paidCents`, and
`balanceCents`.

### Error format

```json
{
  "error": {
    "code": "OUTSTANDING_BALANCE",
    "message": "Session has an outstanding balance",
    "details": { "balanceCents": 1500 }
  }
}
```

Validation errors return `400`, missing/invalid authentication `401`, missing
permissions `403`, unknown resources `404`, and business conflicts `409`.

## Business rules

- Item unit prices are snapshotted when added. Later product price changes do
  not alter existing items.
- Item removal is logical: status, author, and timestamp are preserved.
- Closed or cancelled sessions reject item and payment changes.
- A table cannot have two open sessions, enforced by a partial unique index and
  application checks.
- Payments may be partial and multiple, but never exceed the outstanding
  balance.
- A session can only be closed when its balance is zero.
- A session with registered payments cannot be cancelled.
- Roles and permissions are enforced on every protected endpoint.
- Session-mutating operations lock the session row inside a transaction to
  serialize concurrent changes.

## Tests

```bash
bun test
bun run check
```

The suite covers monetary conversions, permission rules, session/payment
invariants, price snapshotting, audited removals, table occupancy, close and
cancel rules, token signing, and input validation.

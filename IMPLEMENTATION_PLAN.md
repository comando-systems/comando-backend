# Comandô - Implementation Plan

This plan is the implementation checklist and decision record. Keep decisions here; do not create a separate decisions document.

## Execution rules

- Complete phases in order, but keep each phase independently buildable and testable.
- Inspect the existing repository before adding or replacing dependencies.
- Do not invent requirements that are not in `README.md` or confirmed below.
- When a decision is needed, record it in the decision template at the end of this file before implementing the affected behavior.
- Do not create feature-local copies of domain/application/infrastructure layers. Follow the centralized `app`, `domain`, and `infrastructure` structure in `AGENTS.md`.

## Phase 5 - Authentication and user administration

1. Implement password hashing and verification using Argon2id or a suitable Bun-supported API after checking current documentation.
2. Implement login and short-lived JWT access tokens.
3. Validate token signature, expiration, and required claims.
4. Keep secrets in validated environment configuration.
5. Implement create/edit/deactivate user use cases.
6. Support multiple roles per user and union-of-roles authorization.
7. Ensure disabled users cannot authenticate; define behavior for already-issued tokens and test it.
8. Implement refresh-token rotation/revocation only if confirmed in the decision record.
9. Add unit, integration, and API tests.

**Acceptance:** authentication and user administration work with role enforcement and no plaintext password storage.

## Phase 6 - Item administration

1. Implement create/edit/remove item use cases for `ADMIN`.
2. Use soft removal (`deleted_at`) for catalog removal in the initial schema.
3. Prevent removed items from being added to new orders.
4. Preserve historical order lines and price snapshots.
5. Add validation, authorization, and repository tests.

**Acceptance:** ADMIN manages the catalog; other roles cannot mutate it; historical orders remain intact.

## Phase 7 - Order application use cases

### CASHIER

1. Create a counter order with all lines and payments in one request.
2. Validate every item, quantity, and payment method.
3. Calculate totals on the server and require payments to sum to the order total.
4. Persist the order directly as `CLOSED`, atomically.
5. Read order history using the agreed filters and visibility rules.
6. Close or cancel eligible open table orders.

### SERVER

1. Open a table order as `OPEN`.
2. Add items and update quantities while the order is open.
3. When an item is already present, update its existing line instead of creating a duplicate.
4. Close or cancel an eligible open table order.

### Shared rules

- Reject changes to `CLOSED` and `CANCELED` orders.
- Preserve unit price snapshots.
- Update line data and order total in the same transaction.
- Closing requires a non-zero total; negative balances allow no payments, otherwise payments sum exactly to the total.
- Record actor and relevant timestamps.
- Enforce role permissions in application use cases.

**Acceptance:** all lifecycle and permission cases are covered by tests.

## Phase 8 - HTTP API

1. Define route paths, request/response DTOs, and API conventions.
2. Put HTTP wiring, handlers, validation, and error mapping under `app/http`.
3. Authenticate requests and build an explicit actor context.
4. Call application use cases from handlers; do not place business rules in route handlers.
5. Add pagination/filtering to history according to the confirmed decision below.
6. Add login rate limiting, payload limits, and appropriate CORS configuration.
7. Add API/E2E tests for every role and lifecycle flow.

**Acceptance:** documented HTTP endpoints expose the use cases and reject invalid/unauthorized requests.

## Phase 9 - Logging, audit, and hardening

1. Add structured logs with request ID, method, route, status, and duration.
2. Persist audit events for relevant administrative and order lifecycle actions.
3. Redact credentials, hashes, JWTs, refresh tokens, and authorization headers.
4. Verify token expiry, disabled-user behavior, error sanitization, and secret handling.
5. Document configuration, startup, database setup, migration procedure, and tests.

**Acceptance:** useful observability exists without leaking sensitive information.

## Phase 10 - Final verification

Run:
1. formatting;
2. lint;
3. TypeScript type-check;
4. unit tests;
5. integration tests;
6. API/E2E tests;
7. migration UP and DOWN tests against a clean disposable PostgreSQL database;
8. production build and startup smoke test.

Fix failures rather than weakening tests. Update README and this plan if implementation changes confirmed behavior.

---

## Decision record (keep this section updated)

Use this compact format for each unresolved decision:

```text
### DEC-XX - Short title
- Status: OPEN | ACCEPTED | REJECTED
- Context:
- Decision:
- Consequences:
```

### Open decisions

### DEC-01 - Table identity
- Status: ACCEPTED
- Context: The current scope says table orders, but does not define whether tables are managed resources.
- Decision: `Order` stores a required `table_code` for `TABLE` orders. There is no separate `Table` entity in the initial scope.
- Consequences: Table availability is represented by the partial unique index on open table orders; no table CRUD or availability use cases are added.

### DEC-02 - Empty table orders
- Status: ACCEPTED
- Context: It is not specified whether a server can open a table order before adding its first item.
- Decision: An empty `OPEN` table order is valid and may be canceled, but not closed while its total is zero. Counter orders still require at least one line.
- Consequences: No minimum-line constraint is added to table orders; closing requires a non-zero total.

### DEC-03 - Order history access
- Status: ACCEPTED
- Context: CASHIER can view order history, but date range, filters, pagination, and visibility are unspecified.
- Decision: CASHIER sees all orders. Defaults are page 1 and page size 20 (maximum 100), newest first. Optional filters are `status`, `type`, `from`, and `to`. ADMIN and SERVER do not receive order-history permission.
- Consequences: History endpoints require `orders:history`; indexes on `created_at` and `(status, order_type)` support the filters.

### DEC-04 - Refresh tokens
- Status: ACCEPTED
- Context: JWT access authentication is in scope; refresh-session behavior is not specified.
- Decision: The initial implementation issues short-lived access tokens only. Refresh tokens are not implemented and the `refresh_tokens` table remains unused. Disabled users are rejected on every authenticated request because the current user state is loaded from the database.
- Consequences: Disabling a user immediately invalidates access even for an already-issued, unexpired token. Rotation and revocation flows are deferred.

### DEC-07 - Add-item semantics
- Status: ACCEPTED
- Context: Adding an item that already exists must update the existing line instead of creating a duplicate.
- Decision: `POST /orders/:id/items` increments the existing line quantity. `PATCH /orders/:id/items/:itemId` sets an absolute quantity. Unit-price snapshots never change after the line is created.
- Consequences: Both operations are explicit and idempotency requires PATCH when the caller intends to set a final quantity.

### DEC-08 - Table order closing and cancellation permission
- Status: ACCEPTED
- Context: `README.md` mentions that a cashier/server can close a table order, while `AGENTS.md` and this plan originally assigned closing to CASHIER.
- Decision: CASHIER and SERVER can both close and cancel table orders. CASHIER still owns counter orders and history; SERVER still owns opening and editing.
- Consequences: `orders:close` and `orders:cancel` are granted to both CASHIER and SERVER; authorization tests cover both roles.

### DEC-09 - Payment recording
- Status: ACCEPTED
- Context: Counter orders are closed immediately and table orders are closed later, but the payment breakdown was unspecified.
- Decision: `payment_method` is an enum (`CASH`, `DEBIT_CARD`, `CREDIT_CARD`, `PIX`, `OTHER`). Counter creation and table close require a non-zero total. Negative balances accept no payments; otherwise payments must sum exactly to the order total.
- Consequences: `order_payments` stores one row per payment method/amount; the application enforces the total and the database enforces positive amounts and valid methods.

### DEC-10 - Database connections and repository lifetime
- Status: ACCEPTED
- Context: The API needs separate read and write connections without recreating repositories on every request.
- Decision: `DATABASE_READ_URL` and `DATABASE_WRITE_URL` are separate validated variables, currently pointing to the same PostgreSQL. The container creates repositories once and caches them. Repositories receive a `DatabaseConnections` object; an `AsyncLocalStorage` scopes the active transaction so the same singleton repositories use it.
- Consequences: Read paths use the read connection outside transactions, write paths use the write connection, and transactions are explicit in the application layer.

### DEC-05 - Item removal
- Status: ACCEPTED
- Context: Items may be referenced by historical order lines.
- Decision: The initial implementation uses soft removal (`deleted_at`) and prevents removed items from being added to new orders.
- Consequences: Historical order lines remain queryable; the initial API's remove operation marks an item as removed.

### DEC-06 - Order item uniqueness
- Status: ACCEPTED
- Context: A catalog item appears at most once in a given order.
- Decision: `(order_id, item_id)` is the composite primary key. Adding the same item updates the existing line quantity.
- Consequences: No separate identity column is needed for `OrderItem`; the domain uses a composite key Value Object.

# AGENTS.md

## Project goal

Build Comandô, a TypeScript + Bun backend for counter sales and table orders. Follow `README.md` and the implementation sequence in `IMPLEMENTATION_PLAN.md`. The domain has one `Order` model with two channels (`COUNTER`, `TABLE`) and three lifecycle states (`OPEN`, `CLOSED`, `CANCELED`).

## Language and communication

- All source code identifiers, filenames, comments, commit messages, pull request titles/descriptions, and technical documentation must be written in English.
- Commit messages and PR titles must be concise, specific, and use imperative wording where practical.
- Code comments must be concise and direct. Explain why a non-obvious decision exists; do not narrate what the code already says.
- Do not add Portuguese comments, commit messages, or PR content.
- User-facing API messages may be Portuguese if explicitly required by product behavior.

## Architecture

Use exactly these three primary source areas:

```text
src/
  app/
  domain/
  infrastructure/
```

Do not create a complete `domain/application/infrastructure/presentation` stack inside every feature/module. Responsibilities are centralized:

### `app/`

- Application use cases and orchestration.
- Coordinates domain entities and repository interfaces.
- Defines transaction boundaries.
- Applies authorization and invokes domain behavior.
- Contains HTTP API wiring, route handlers, request parsing/validation, and error-to-HTTP mapping under `app/http` when needed.
- Do not create a separate `presentation` directory or layer.

### `domain/`

- `domain/entity`: entities and closely related domain DTOs.
- `domain/types`: shared domain types and enums when they warrant a separate file.
- `domain/value-objects`: reusable Value Objects such as `Money`, typed IDs, and composite keys.
- `domain/repository`: repository interfaces/contracts.
- `domain/errors`: domain-specific errors.
- Keep the structure small. A small enum/type may live in the relevant `index.ts`; do not create `types.ts` merely by habit.
- Domain code must not import Bun HTTP APIs, database clients, JWT libraries, environment variables, or infrastructure implementations.

### `infrastructure/`

- Database connection, transaction adapter, and concrete repository implementations.
- JWT signing and verification.
- Password hashing.
- Structured logging and external integrations.
- SQL migrations are maintained in the root `migrations/` directory, not hidden inside runtime source.

Do not add feature-local copies of these layers. Do not create `modules/<feature>/{domain,application,infrastructure,presentation}`.

## Imports and public entry points

- Each cohesive package/folder that is intended as a public import surface exposes an `index.ts`.
- Consumers import from that public `index.ts`, not from another package's internal implementation files.
- Export public entities, DTOs, interfaces, types, and enums from the appropriate `index.ts`.
- When types/enums are small, define and export them in that `index.ts`; create a separate `types.ts` only when it materially improves organization.
- Avoid `export *` everywhere, circular dependencies, barrel chains, and duplicate exports.
- Internal files in the same package may use direct relative imports where this avoids circular imports.
- Do not create an `index.ts` in every directory automatically; create public entry points where a package boundary exists.

## General engineering principles

1. Prefer simple, explicit solutions over speculative abstractions.
2. Keep files focused and reasonably small; split by responsibility, not by arbitrary line counts.
3. Avoid duplication. A business rule must have one authoritative implementation.
4. Use strict TypeScript. Avoid `any`, unsafe casts, and non-null assertions unless justified.
5. Prefer composition and constructor injection.
6. Keep side effects at application/infrastructure boundaries.
7. Do not make domain entities depend on a global DI container.
8. Do not introduce a generic framework when a small interface or function is sufficient.
9. Validate external input at the API boundary and enforce invariants in the domain/application flow.
10. Do not silently change domain behavior to make implementation easier.

## Domain rules

- Each domain entity has a specific typed ID and repository contract.
- Repository interfaces belong in `domain`; concrete repository classes belong in `infrastructure`.
- `Money` uses integer cents/minor units. Never use floating-point arithmetic for money.
- Value Objects are immutable and implement value-based equality where appropriate.
- `OrderItem` is unique per `(OrderID, ItemID)`. Adding an existing item to an order updates its quantity; it must not create a second line.
- Represent the order-line identity as a composite Value Object such as `OrderItemKey` or `ItemOrderKey`, containing `OrderID` and `ItemID`.
- Preserve the unit price at order time on the order line. Changes to the current catalog item must not alter historical totals.
- Quantity must be a positive integer.
- Calculate totals on the server; never trust client-submitted totals.
- A `COUNTER` order is created with its complete set of lines and persisted directly as `CLOSED` in one transaction.
- A `TABLE` order is opened as `OPEN`. A `SERVER` can add items/change quantities. Both `CASHIER` and `SERVER` can close or cancel it.
- Closing an order records its payment methods and amounts. Payments must sum exactly to the order total; zero-total orders require no payments.
- `CLOSED` and `CANCELED` are terminal states in the initial scope.
- Users must be deactivated/soft-deleted, never physically deleted.
- Removing an item from the active catalog must not destroy historical order data.
- Do not split counter and table orders into separate entity models.

## Roles and authorization

- Supported roles: `ADMIN`, `CASHIER`, `SERVER`.
- Users may have multiple roles; effective permissions are the union of their roles.
- `ADMIN`: create/edit/deactivate users; create/edit/remove items.
- `CASHIER`: create completed counter orders; view permitted order history; close or cancel open table orders.
- `SERVER`: open table orders; add items/change quantities; close or cancel open table orders.
- Enforce permissions in application use cases. HTTP middleware may provide an early check but does not replace use-case authorization.
- Disabled users cannot authenticate. Define and test how disabling a user affects already-issued tokens.

## DI and configuration

- Use one explicit composition root and a small DI container.
- Prefer constructor injection.
- Do not use the container as a service locator throughout the application.
- Validate environment configuration at startup.
- Keep secrets out of source control and logs.
- Make clock, ID generation, repositories, and external services replaceable in tests where useful.

## Database and migrations

- Use PostgreSQL SQL migrations with paired `UP` and `DOWN` files.
- Every standalone surrogate primary key must use `GENERATED BY DEFAULT AS IDENTITY`.
- `OrderItem` uses the composite primary key `(order_id, item_id)`; do not add a redundant identity column to it.
- Add foreign keys, check constraints, unique constraints, and indexes for actual domain/query requirements.
- Use transactions for all multi-row order operations.
- Do not run migrations automatically as an incidental side effect of importing or starting application modules.
- Keep migration changes reversible. A DOWN migration must undo only the corresponding UP migration in dependency-safe order.

## Authentication and logging

- Store only password hashes. Prefer Argon2id after verifying the current Bun API or selected library.
- JWT access tokens must be signed, short-lived, and validated for signature and expiry. Validate issuer/audience when configured.
- Secrets come from validated environment variables or a secret manager.
- If refresh tokens are implemented, persist only token hashes and support rotation/revocation.
- Use structured logs with request IDs and useful context.
- Never log credentials, password hashes, JWTs, refresh tokens, authorization headers, or secrets.
- Keep operational logs distinct from persistent audit events.

## Testing

Write tests as each feature is implemented.

- Unit tests: Money arithmetic, Value Object equality, typed IDs, composite `OrderItemKey`, quantity validation, totals, status transitions, and authorization.
- Integration tests: repository mapping, SQL constraints, migration UP/DOWN, transaction rollback, and concurrent order updates.
- API/E2E tests: login, disabled users, multiple roles, counter order creation, table order lifecycle, history, and forbidden actions.
- Test that a repeated item in the same order updates the existing line and preserves the `(order_id, item_id)` uniqueness rule.
- Test that catalog price changes do not alter existing order totals.
- Use isolated test databases and deterministic dependencies. Never depend on production credentials or a developer's local database state.
- Do not mock the unit under test; mock external boundaries only.

## Required implementation workflow

1. Inspect the repository, package scripts, Bun version, TypeScript configuration, dependencies, and existing conventions.
2. Read `README.md`, this file, and `IMPLEMENTATION_PLAN.md` before coding.
3. Implement the project foundation and tests before domain features.
4. Implement shared domain primitives before entities that depend on them.
5. Implement domain entities and repository contracts before concrete persistence adapters.
6. Implement infrastructure adapters and migrations with integration tests.
7. Implement application use cases and authorization.
8. Wire the HTTP API to application use cases.
9. Add structured logging, audit behavior, and security hardening.
10. Run formatting, lint, type-check, unit, integration, and API/E2E tests.
11. Update documentation when actual behavior or configuration changes.

## Definition of done

A change is complete only when:
- it follows the architecture and language rules above;
- domain rules are implemented once in the correct place;
- relevant tests cover success, invalid input, unauthorized access, and important edge cases;
- migrations are reversible and tested when persistence changes;
- formatting, lint, type-check, and relevant tests pass;
- no secrets or sensitive authentication data are logged;
- no speculative abstraction, duplicate implementation, or unrelated refactor was introduced.

# AGENTS.md

## Project Overview

Comandô is a restaurant order management system built with TypeScript, Bun, and PostgreSQL.

The application manages users, roles, products, tables, service sessions, order items, and payments.

Core business rules include:
- Users may have multiple roles.
- Service sessions may be associated with a table or counter service.
- Order items must preserve their unit price at the time they are added.
- Item removals must retain the history required for auditing.
- Closed sessions must not accept incompatible modifications.
- Multiple payments may be associated with a single service session.
- Table occupancy and session state must remain consistent.

## Core Principles

### 1. Simplicity First

- Prefer straightforward solutions over unnecessary abstractions.
- Implement only what current requirements justify.
- Avoid speculative features and premature optimization.
- Do not introduce dependencies without a clear benefit.
- Prefer explicit, readable code over clever or overly generic implementations.

### 2. Modularity and Organization

- Keep each module focused on a single responsibility.
- Separate business rules, application logic, HTTP handling, and persistence.
- Keep files reasonably small and cohesive.
- Split large modules when their responsibilities become difficult to understand or test.
- Group related functionality by domain rather than creating arbitrary collections of utilities.
- Avoid circular dependencies.
- Define clear boundaries between modules and expose only the interfaces they need.

A possible structure is:

```text
src/
  app/
    config/
    errors/
  modules/
    users/
      user.routes.ts
      user.controller.ts
      user.service.ts
      user.repository.ts
      user.schema.ts
      user.types.ts
    products/
    sessions/
    order-items/
    payments/
    roles/
  database/
    client.ts
    schema/
  shared/
    http/
    validation/
  index.ts

drizzle/
tests/
```

This structure is a starting point, not a mandatory hierarchy. Adapt it to actual complexity and existing project conventions. Do not create empty layers or files merely to match the example.

### 3. Avoid Duplication

- Follow the DRY principle when it improves maintainability.
- Never duplicate business rules across routes, controllers, services, or repositories.
- Centralize shared validation rules and domain invariants.
- Reuse existing utilities and modules before creating new ones.
- Avoid multiple functions that perform essentially the same operation.
- Extract shared logic when duplication is meaningful, not merely because two small code fragments look similar.
- Keep a single authoritative source for configuration and domain constants.
- Do not create generic abstractions that are harder to understand than the duplicated code they replace.

### 4. TypeScript and Bun

- Use TypeScript for application code.
- Prefer explicit domain types and inferred types where inference remains clear.
- Avoid `any`; use `unknown` when a value must be validated before use.
- Do not use type assertions to bypass unresolved type errors.
- Validate external input at runtime. TypeScript types do not validate HTTP requests.
- Use Bun-native commands and APIs when appropriate.
- Use `bun install` and preserve the existing `bun.lock` file.
- Use `bun run <script>` for project scripts.
- Use `bunx` for package executables when appropriate.
- Check the installed Bun version and existing dependencies before introducing new tooling.
- Do not mix package managers or regenerate the lockfile unnecessarily.

### 5. Separation of Responsibilities

- Routes define HTTP endpoints and connect requests to handlers.
- Controllers handle HTTP-specific concerns when a separate controller layer is justified.
- Services or use-case modules coordinate application operations.
- Domain logic defines business rules and invariants.
- Repositories encapsulate database access when this abstraction provides value.
- Validation schemas define and validate external input.
- Shared modules contain genuinely reusable functionality.

Do not move code between layers without a clear reason. Avoid adding pass-through functions that contribute no meaningful responsibility.

### 6. Database and Data Integrity

- Use PostgreSQL constraints to protect important data invariants.
- Manage schema changes through versioned migrations.
- Use Drizzle ORM and Drizzle Kit if they are the project's chosen database tools.
- Never mix migration systems without an explicit architectural reason.
- Do not rewrite migrations that have already been applied in shared or production environments.
- Use transactions for operations that require multiple database changes to succeed or fail together.
- Prevent invalid state transitions at the application and database levels where practical.
- Avoid N+1 queries and unnecessary database round trips.
- Use parameterized queries and the ORM's safe query mechanisms.

Business-specific requirements:

- Preserve historical unit prices for existing order items.
- Record item removals in an auditable manner.
- Prevent invalid modifications to closed sessions.
- Enforce table occupancy rules consistently, including concurrent requests.
- Keep payments associated with the correct service session.
- Prevent unauthorized operations regardless of the client interface.

### 7. Validation, Errors, and Security

- Validate all untrusted input at system boundaries.
- Reuse validation schemas where the same contract is shared.
- Return consistent HTTP status codes and error response formats.
- Never expose stack traces, secrets, or internal database details in production responses.
- Keep authentication and authorization separate concerns.
- Enforce permissions on the server, never solely in the client.
- Verify permissions for every protected operation.
- Store secrets in environment variables or an appropriate secret-management system.
- Do not commit credentials, tokens, or production data.
- Use safe defaults and fail explicitly when required configuration is missing.

### 8. Testing

- Write automated tests for meaningful business behavior.
- Prioritize critical rules involving permissions, payments, session closure, item prices, and table occupancy.
- Test expected behavior, invalid input, failure cases, and relevant boundary conditions.
- Add regression tests when fixing bugs.
- Prefer deterministic tests that do not depend on execution order.
- Mock external boundaries only when useful; do not mock away the behavior being tested.
- Use the project's existing test framework and conventions.
- Run relevant tests after changing behavior and the full test suite when practical.
- Never remove or weaken a test merely to make an implementation pass.

### 9. Naming and Code Style

- Keep source code, identifiers, comments, and technical documentation in English.
- Use descriptive names that communicate intent.
- Follow the naming conventions already established in the repository.
- Keep functions focused and limit unnecessary parameters.
- Avoid deeply nested conditionals when guard clauses or simpler control flow improve readability.
- Prefer immutable values when practical.
- Use comments to explain non-obvious decisions, constraints, or trade-offs.
- Keep comments concise and update them when behavior changes.
- Do not add comments that simply restate the code.

### 10. Dependencies and Configuration

- Prefer existing dependencies over introducing overlapping libraries.
- Add a dependency only when its value justifies its maintenance and security costs.
- Keep environment-specific configuration out of business logic.
- Provide an environment variable example file without real credentials.
- Validate required configuration at application startup.
- Keep development, test, and production settings explicit.

### 11. Logging and Observability

- Use structured logging where appropriate.
- Include useful context for diagnosing failed operations.
- Avoid logging passwords, tokens, payment-sensitive information, or unnecessary personal data.
- Do not use logging as a substitute for proper error handling.
- Avoid duplicate logs for the same error at every layer.
- Log important state changes when operationally useful and safe.

### 12. API Design

- Keep request and response formats consistent.
- Use appropriate HTTP methods and status codes.
- Separate API contracts from internal database representations when necessary.
- Avoid exposing internal fields unintentionally.
- Document non-obvious endpoints and business constraints.
- Ensure that repeated requests and concurrent operations do not violate data integrity.
- Apply pagination and filtering when collection size or usage requires them.

### 13. Change Management

Before making changes:

1. Inspect the existing implementation and project structure.
2. Identify existing utilities, conventions, and tests.
3. Determine the smallest change that correctly solves the problem.
4. Consider effects on related modules and business rules.

When implementing changes:

1. Reuse existing patterns when they remain appropriate.
2. Avoid unrelated refactoring.
3. Update tests and documentation when necessary.
4. Keep changes focused and reviewable.

After making changes:

1. Run relevant tests.
2. Run type checking and linting if configured.
3. Review the diff for duplication, unnecessary complexity, and accidental changes.
4. Report what changed and which checks were executed.
5. Clearly disclose any checks that could not be completed.

Never claim a test, build, or validation succeeded unless it was actually executed successfully.

## Final Rule

Optimize for correctness, clarity, maintainability, and simplicity.

A solution is not better merely because it introduces more layers, files, abstractions, or dependencies. Every architectural decision should solve a real problem and make the system easier to understand, test, or evolve.

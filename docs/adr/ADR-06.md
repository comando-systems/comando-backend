# ADR-06: Concurrency and polling

- Status: Accepted
- Date: 2026-11-05

## Context

Several devices edit the same table: a server adds items while a cashier changes pricing or takes payment. Each device currently keeps its own local state.

## Decision

- Every order mutation loads the order with `FOR UPDATE` inside a transaction, which already prevents lost updates. This stays the integrity mechanism.
- Responses carry `version`. Mutating requests may send `expectedVersion`; when present and stale, the API answers `409 VERSION_CONFLICT` with the current version. It is optional because the row lock already serializes writers.
- Opening a table is idempotent: if the table already has an order that is open or awaiting payment, that order is returned instead of an error (ADR-01).
- Clients refresh the live orders list by polling every 5 to 10 seconds while visible. Push notifications and server-sent events are out of scope for now.

## Consequences

- Integration tests cover concurrent updates, as `AGENTS.md` requires.
- Polling adds read load: the live list is filtered by status and indexed for it.

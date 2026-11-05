# ADR-03: Counter sale drafts live in the client

- Status: Accepted
- Date: 2026-11-05

## Context

The app builds a counter sale item by item and charges at the end. The domain requires a `COUNTER` order to be created complete and persisted as `CLOSED` in one transaction, and never as `OPEN`.

## Decision

- The draft of a counter sale exists only on the device until the cashier charges.
- Charging sends one `POST /orders/counter` with: lines (`itemId`, `quantity`), optional customer label, optional adjustment, whether the service fee applies, and payments.
- The client never sends prices, subtotals, or totals. The server reads current prices, snapshots them on the lines, and computes every amount (ADR-04).
- The backend has no draft state. Discarding a draft is a client action; a persisted counter order cannot be canceled.

## Consequences

- No domain change for `COUNTER`.
- An unfinished draft is lost if the app data is cleared. This is accepted for now.
- `orders` gains an optional `label` for the customer name on counter sales.

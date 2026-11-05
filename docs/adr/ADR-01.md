# ADR-01: `AWAITING_PAYMENT` order status

- Status: Accepted
- Date: 2026-11-05

## Context

On the floor, the server asks to close a table and the cashier takes the payment. The app already models this handoff (open, awaiting payment, paid). The domain only had `OPEN`, `CLOSED`, and `CANCELED`, with the closing user recording payments in one step.

## Decision

Add `AWAITING_PAYMENT` to `OrderStatus`. Allowed transitions:

| From | To | Rule |
|---|---|---|
| `OPEN` | `AWAITING_PAYMENT` | `TABLE` only; the order needs at least one line. Records who and when. |
| `AWAITING_PAYMENT` | `OPEN` | Reopen; clears the request. |
| `OPEN`, `AWAITING_PAYMENT` | `CLOSED` | Payments sum exactly to the total; zero-total orders need none. |
| `OPEN`, `AWAITING_PAYMENT` | `CANCELED` | |

`CLOSED` and `CANCELED` stay terminal. `COUNTER` orders are created `CLOSED` and never pass through `AWAITING_PAYMENT`.

Line edits are allowed only in `OPEN`. Pricing edits (ADR-04) are allowed in `OPEN` and `AWAITING_PAYMENT`.

Persistence:

- Add `AWAITING_PAYMENT` to the `order_status` enum, with `payment_requested_at` and `payment_requested_by_user_id` and matching `CHECK`s.
- The "one active order per `table_code`" unique index covers `OPEN` and `AWAITING_PAYMENT`: a table waiting for payment is still occupied.
- Opening a table that already has an active order returns that order.

## Consequences

- This changes a rule stated in `AGENTS.md` ("Both `CASHIER` and `SERVER` can close"); see ADR-02.
- Domain, repository, migration, and tests change together. The migration must keep its `DOWN` reversible (a `DOWN` that finds `AWAITING_PAYMENT` rows must reopen them before removing the value).

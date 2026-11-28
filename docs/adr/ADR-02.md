# ADR-02: Role permissions for orders

- Status: Accepted
- Date: 2026-11-05

## Context

The client separates three concerns: administrators manage the business, cashiers run the till, and servers run the floor. Counter sales are complete at creation; table orders are opened, edited over time, and closed later. The original role table mixed these concerns.

## Decision

Effective permissions remain the union of a user's roles. The table is:

| Permission | ADMIN | CASHIER | SERVER |
|---|---|---|---|
| `users:manage` | yes | | |
| `items:manage` | yes | | |
| `settings:manage` | yes | | |
| `reports:view` | yes | | |
| `orders:counter` | | yes | |
| `orders:history` | yes | yes | |
| `orders:open` | | | yes |
| `orders:update` (lines, pricing) | | | yes |
| `orders:request-payment` (request and reopen, ADR-01) | | | yes |
| `orders:close` (take payment) | | yes | yes |
| `orders:cancel` | | yes | yes |

- `ADMIN` handles users, items, settings, reports, and order history; it does not run the till or the floor.
- `CASHIER` creates completed counter orders and can close or cancel table orders.
- `SERVER` owns the floor: it opens table orders, edits lines and pricing, requests payment, reopens, closes, and cancels them. Closing a table no longer requires a cashier.
- Settings and the summary report require `ADMIN`. Settings are readable by any authenticated user.
- Use cases enforce these permissions. Route middleware is only an early check.

## Consequences

- `ROLE_PERMISSIONS` and `Permission` change in the domain, with unit tests for each role and for unions such as `CASHIER` + `SERVER`.
- The `README.md` and `AGENTS.md` role tables must be updated when this ships.

Revised 2026-11-28: the floor owns the whole table lifecycle (`SERVER` gained `orders:close`), the till owns counter sales and closing (`CASHIER` lost `orders:open`, `orders:update`, `orders:request-payment`), and `ADMIN` is administrative only (lost `orders:counter`, `orders:close`, `orders:cancel`).

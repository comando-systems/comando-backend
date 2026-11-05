# ADR-02: Role permissions for orders

- Status: Accepted
- Date: 2026-11-05

## Context

The client lets cashiers open tables and add items, lets the admin operate as a cashier and read the daily summary, and does not let servers take payments. The original role table did not allow this.

## Decision

Effective permissions remain the union of a user's roles. The table is:

| Permission | ADMIN | CASHIER | SERVER |
|---|---|---|---|
| `users:manage` | yes | | |
| `items:manage` | yes | | |
| `orders:counter` | yes | yes | |
| `orders:history` | yes | yes | |
| `orders:open` | | yes | yes |
| `orders:update` (lines, pricing) | | yes | yes |
| `orders:request-payment` (request and reopen, ADR-01) | | yes | yes |
| `orders:close` (take payment) | yes | yes | |
| `orders:cancel` | yes | yes | yes |

- `orders:request-payment` is new. A `SERVER` no longer closes orders; they request payment and the cashier closes.
- Settings and the summary report require `ADMIN`. Settings are readable by any authenticated user.
- Use cases enforce these permissions. Route middleware is only an early check.

## Consequences

- `ROLE_PERMISSIONS` and `Permission` change in the domain, with unit tests for each role and for unions such as `CASHIER` + `SERVER`.
- The `README.md` and `AGENTS.md` role tables must be updated when this ships.

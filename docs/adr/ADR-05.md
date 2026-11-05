# ADR-05: Item enabled flag and user deactivation

- Status: Accepted
- Date: 2026-11-05

## Context

The app has both "Active" and "Delete" for products and for users. The backend treats item removal as `deleted_at`, and users are deactivated, never deleted. The API already exposes `isActive` for items and users, meaning "not removed / not deactivated".

## Decision

Items:

- Add `enabled` (default true, column `items.active`) and `category` (required text, default `Uncategorized`).
- `enabled = false` hides the item from sale but keeps it listed for administrators and editable.
- Removal sets `deleted_at` and hides the item everywhere except history. Past order lines are never affected.
- Adding a disabled or removed item to an order is rejected. In the domain, `isActive` means "not removed", `isEnabled` is the switch, and `isSellable` is both.

Users:

- `DELETE /users/:id` keeps deactivating (soft delete). Reactivation is `PATCH /users/:id` with `isActive: true`.
- An administrator cannot deactivate themselves or remove their own administrator role, and the last active administrator cannot be deactivated or demoted. Concurrent changes are serialized with an advisory lock.
- A single role in the app maps to a one-element role list; the API accepts several roles per user.

Role names map `admin`, `caixa`, `garcom` to `ADMIN`, `CASHIER`, `SERVER`.

## Consequences

- Migration adds `items.active` and `items.category`.
- Item and user use cases carry the self-lockout and last-administrator rules, with tests.

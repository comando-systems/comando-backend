# ADR-04: Order pricing: surcharge, discount, and service fee

- Status: Accepted
- Date: 2026-11-05
- Updated: 2026-11-11

## Context

The app applies a surcharge, a discount, or both, plus a configurable service fee. Totals must be computed by the server, in integer cents, and historical totals must not change when settings change.

## Decision

Total calculation, in this order:

1. `subtotal` = sum of line totals.
2. `surcharge` = a non-negative amount in cents added to the subtotal.
3. `discount` = a non-negative amount in cents removed from the subtotal plus the surcharge. It cannot exceed `subtotal + surcharge`.
4. `base` = `subtotal + surcharge - discount`.
5. `serviceFee` = `round(base * serviceFeeBasisPoints / 10000)` when the order applies the fee and settings have it enabled; otherwise 0.
6. `total` = `base + serviceFee`.

The surcharge and the discount are independent, so an order may have a surcharge, a discount, both, or neither. Rounding is half-up on integer cents. No floating point is used for money.

Persistence:

- `orders`: `surcharge_cents`, `discount_cents`, `apply_service_fee`, `service_fee_basis_points`, `service_fee_cents`, and the final `total_amount_cents`. Both amount columns are non-negative and default to zero. The applied fee rate and amounts are snapshotted, so later setting changes do not alter existing orders.
- `settings`: a single row with `service_fee_enabled` and `service_fee_basis_points`.
- `order_payments`: `received_cents` and `change_cents` for cash, so a receipt can show them. The payment amount still counts toward the exact-sum rule.
- `apply_service_fee` defaults to true for `TABLE` orders and false for `COUNTER` orders, matching the app.
- The service fee is off in the settings until an administrator enables it (default rate 10%), so deploying this change does not alter any existing total. An order snapshots the rate when it is opened or when its fee is toggled; with the fee off that rate is zero.

## Consequences

- The calculation lives once, in the domain `Order`. Clients show the server totals; any client-side calculation is only a preview and must use the same order and rounding.
- Domain, migration, repository mapping, and tests change together, including a test that a settings change does not alter existing orders.

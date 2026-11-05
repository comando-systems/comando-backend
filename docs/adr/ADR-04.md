# ADR-04: Order pricing: adjustment and service fee

- Status: Accepted
- Date: 2026-11-05

## Context

The app applies a discount or surcharge (percent or fixed amount) and a configurable service fee. Totals must be computed by the server, in integer cents, and historical totals must not change when settings change.

## Decision

Total calculation, in this order:

1. `subtotal` = sum of line totals.
2. `adjustment`: a percent adjustment is `round(subtotal * basisPoints / 10000)`; a fixed adjustment is its cents. A discount is capped at `subtotal` and applied as negative; a surcharge is positive.
3. `base` = `subtotal + adjustment`.
4. `serviceFee` = `round(base * serviceFeeBasisPoints / 10000)` when the order applies the fee and settings have it enabled; otherwise 0.
5. `total` = `max(0, base + serviceFee)`.

Rounding is half-up on integer cents (inputs are non-negative where rounded). No floating point is used for money.

Percentages are stored as integer basis points (10% = 1000, 12.5% = 1250), so decimals are exact.

Persistence:

- `orders`: `adjustment_type`, `adjustment_mode`, `adjustment_value`, `adjustment_cents`, `apply_service_fee`, `service_fee_basis_points`, `service_fee_cents`, and the final `total_amount_cents`. The applied fee rate and amounts are snapshotted, so later setting changes do not alter existing orders.
- `settings`: a single row with `service_fee_enabled` and `service_fee_basis_points`.
- `order_payments`: `received_cents` and `change_cents` for cash, so a receipt can show them. The payment amount still counts toward the exact-sum rule.
- `apply_service_fee` defaults to true for `TABLE` orders and false for `COUNTER` orders, matching the app.

## Consequences

- The calculation lives once, in the domain `Order`. Clients show the server totals; any client-side calculation is only a preview and must use the same order and rounding.
- Domain, migration, repository mapping, and tests change together, including a test that a settings change does not alter existing orders.

-- Restores the previous non-negative total rule. Negative balances created while 007 was applied
-- must be resolved manually before running this migration; no order is changed here.
ALTER TABLE orders DROP CONSTRAINT orders_closed_total_not_zero;

ALTER TABLE orders
    ADD CONSTRAINT orders_total_nonnegative CHECK (total_amount_cents >= 0);

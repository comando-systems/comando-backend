-- Restores the previous non-negative total rule. Negative balances created while 007 was applied
-- must be resolved manually before running this migration; no order is changed here.
DROP TRIGGER orders_reject_zero_total_on_close ON orders;
DROP FUNCTION orders_reject_zero_total_on_close();

ALTER TABLE orders
    ADD CONSTRAINT orders_total_nonnegative CHECK (total_amount_cents >= 0);

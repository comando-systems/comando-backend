-- A discount may exceed items plus surcharge (a gift credit), so totals can be negative.
-- A closed order always has a non-zero balance; canceled orders may keep zero.
ALTER TABLE orders DROP CONSTRAINT orders_total_nonnegative;

ALTER TABLE orders
    ADD CONSTRAINT orders_closed_total_not_zero CHECK (
        status <> 'CLOSED' OR total_amount_cents <> 0
    );

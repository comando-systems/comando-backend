-- Restores the previous open-time reservation. Duplicate active names created while 006 was
-- applied must be resolved manually before running this migration; no order is deleted here.
DROP INDEX orders_active_table_code_idx;

CREATE UNIQUE INDEX orders_one_active_per_table_idx
    ON orders (table_code)
    WHERE order_type = 'TABLE' AND status IN ('OPEN', 'AWAITING_PAYMENT');

ALTER TABLE orders DROP CONSTRAINT orders_table_code_by_type;

ALTER TABLE orders
    ADD CONSTRAINT orders_table_code_by_type CHECK (
        (order_type = 'TABLE' AND table_code IS NOT NULL)
        OR (order_type = 'COUNTER' AND table_code IS NULL)
    );

ALTER TABLE orders DROP CONSTRAINT orders_original_table_code_not_blank;
ALTER TABLE orders DROP COLUMN original_table_code;

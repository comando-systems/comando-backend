-- The active table name is temporary; the original name stays for history and reports.
ALTER TABLE orders ADD COLUMN original_table_code VARCHAR(64) NULL;

UPDATE orders SET original_table_code = table_code WHERE table_code IS NOT NULL;

-- TABLE orders may be unnamed and release their active name on finalization; the original name
-- is still required whenever a name is currently in use.
ALTER TABLE orders DROP CONSTRAINT orders_table_code_by_type;

ALTER TABLE orders
    ADD CONSTRAINT orders_table_code_by_type CHECK (
        (order_type = 'COUNTER' AND table_code IS NULL AND original_table_code IS NULL)
        OR (order_type = 'TABLE' AND (table_code IS NULL OR original_table_code IS NOT NULL))
    );

ALTER TABLE orders
    ADD CONSTRAINT orders_original_table_code_not_blank
    CHECK (original_table_code IS NULL OR length(btrim(original_table_code)) > 0);

-- A named table is occupied only once it has lines. The application serializes the check with
-- an advisory lock; the old unique index would reserve a table at open time, so it is replaced
-- by a plain index for the active-table lookup.
DROP INDEX orders_one_active_per_table_idx;

CREATE INDEX orders_active_table_code_idx
    ON orders (table_code)
    WHERE order_type = 'TABLE' AND status IN ('OPEN', 'AWAITING_PAYMENT');

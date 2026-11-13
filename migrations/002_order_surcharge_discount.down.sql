-- Restore the generic adjustment columns. When both amounts were set, the DOWN migration keeps
-- their net value as a fixed adjustment, because the old model cannot represent both at once.

BEGIN;

CREATE TYPE order_adjustment_type AS ENUM ('DISCOUNT', 'SURCHARGE');
CREATE TYPE order_adjustment_mode AS ENUM ('PERCENT', 'FIXED');

ALTER TABLE orders
    ADD COLUMN adjustment_type order_adjustment_type NULL,
    ADD COLUMN adjustment_mode order_adjustment_mode NULL,
    ADD COLUMN adjustment_value BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN adjustment_cents BIGINT NOT NULL DEFAULT 0;

UPDATE orders
SET
    adjustment_type = CASE
        WHEN surcharge_cents > discount_cents THEN 'SURCHARGE'::order_adjustment_type
        WHEN discount_cents > surcharge_cents THEN 'DISCOUNT'::order_adjustment_type
        ELSE NULL
    END,
    adjustment_mode = CASE
        WHEN surcharge_cents <> discount_cents THEN 'FIXED'::order_adjustment_mode
        ELSE NULL
    END,
    adjustment_value = ABS(surcharge_cents - discount_cents),
    adjustment_cents = surcharge_cents - discount_cents
WHERE surcharge_cents <> 0 OR discount_cents <> 0;

ALTER TABLE orders
    DROP CONSTRAINT orders_discount_nonnegative,
    DROP CONSTRAINT orders_surcharge_nonnegative,
    DROP COLUMN discount_cents,
    DROP COLUMN surcharge_cents;

ALTER TABLE orders
    ADD CONSTRAINT orders_adjustment_pair CHECK (
        (adjustment_type IS NULL) = (adjustment_mode IS NULL)
    ),
    ADD CONSTRAINT orders_adjustment_none_is_zero CHECK (
        adjustment_type IS NOT NULL OR (adjustment_value = 0 AND adjustment_cents = 0)
    ),
    ADD CONSTRAINT orders_adjustment_value_valid CHECK (
        adjustment_value >= 0
        AND (adjustment_mode IS DISTINCT FROM 'PERCENT' OR adjustment_value <= 10000)
    ),
    ADD CONSTRAINT orders_adjustment_sign CHECK (
        adjustment_type IS NULL
        OR (adjustment_type = 'DISCOUNT' AND adjustment_cents <= 0)
        OR (adjustment_type = 'SURCHARGE' AND adjustment_cents >= 0)
    );

COMMIT;

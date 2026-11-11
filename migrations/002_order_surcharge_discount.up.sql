-- Replace the generic percentage/fixed adjustment with two explicit monetary amounts.
-- An order may have a surcharge, a discount, both, or neither.

BEGIN;

ALTER TABLE orders
    ADD COLUMN surcharge_cents BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN discount_cents BIGINT NOT NULL DEFAULT 0;

-- Preserve the net adjustment of existing rows. The split is only known for new rows.
UPDATE orders
SET
    surcharge_cents = GREATEST(adjustment_cents, 0),
    discount_cents = GREATEST(-adjustment_cents, 0);

ALTER TABLE orders
    DROP CONSTRAINT orders_adjustment_sign,
    DROP CONSTRAINT orders_adjustment_value_valid,
    DROP CONSTRAINT orders_adjustment_none_is_zero,
    DROP CONSTRAINT orders_adjustment_pair,
    DROP COLUMN adjustment_cents,
    DROP COLUMN adjustment_value,
    DROP COLUMN adjustment_mode,
    DROP COLUMN adjustment_type;

DROP TYPE order_adjustment_mode;
DROP TYPE order_adjustment_type;

ALTER TABLE orders
    ADD CONSTRAINT orders_surcharge_nonnegative CHECK (surcharge_cents >= 0),
    ADD CONSTRAINT orders_discount_nonnegative CHECK (discount_cents >= 0);

COMMIT;

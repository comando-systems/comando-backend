BEGIN;

DROP TABLE settings;

ALTER TABLE order_payments
    DROP CONSTRAINT order_payments_cash_tender_valid,
    DROP CONSTRAINT order_payments_cash_tender_cash_only,
    DROP CONSTRAINT order_payments_cash_tender_pair,
    DROP COLUMN change_cents,
    DROP COLUMN received_cents;

DROP INDEX orders_one_active_per_table_idx;

ALTER TABLE orders
    DROP CONSTRAINT orders_lifecycle_timestamps,
    DROP CONSTRAINT orders_service_fee_valid,
    DROP CONSTRAINT orders_adjustment_sign,
    DROP CONSTRAINT orders_adjustment_value_valid,
    DROP CONSTRAINT orders_adjustment_none_is_zero,
    DROP CONSTRAINT orders_adjustment_pair,
    DROP CONSTRAINT orders_payment_request_pair,
    DROP CONSTRAINT orders_awaiting_payment_table_only,
    DROP CONSTRAINT orders_label_counter_only,
    DROP CONSTRAINT orders_payment_requested_by_fk;

-- The previous schema has no AWAITING_PAYMENT state: reopen those orders.
UPDATE orders
SET status = 'OPEN',
    payment_requested_at = NULL,
    payment_requested_by_user_id = NULL
WHERE status = 'AWAITING_PAYMENT';

ALTER TABLE orders
    DROP COLUMN service_fee_cents,
    DROP COLUMN service_fee_basis_points,
    DROP COLUMN apply_service_fee,
    DROP COLUMN adjustment_cents,
    DROP COLUMN adjustment_value,
    DROP COLUMN adjustment_mode,
    DROP COLUMN adjustment_type,
    DROP COLUMN payment_requested_by_user_id,
    DROP COLUMN payment_requested_at,
    DROP COLUMN label;

ALTER TABLE orders ADD CONSTRAINT orders_lifecycle_timestamps CHECK (
    (status = 'OPEN' AND closed_at IS NULL AND canceled_at IS NULL)
    OR (status = 'CLOSED' AND closed_at IS NOT NULL AND canceled_at IS NULL)
    OR (status = 'CANCELED' AND canceled_at IS NOT NULL AND closed_at IS NULL)
);

CREATE INDEX orders_table_open_idx
    ON orders (table_code)
    WHERE order_type = 'TABLE' AND status = 'OPEN';
CREATE UNIQUE INDEX orders_one_open_per_table_idx
    ON orders (table_code)
    WHERE order_type = 'TABLE' AND status = 'OPEN';

DROP INDEX items_sellable_category_idx;

ALTER TABLE items
    DROP CONSTRAINT items_category_not_blank,
    DROP COLUMN active,
    DROP COLUMN category;

DROP TYPE order_adjustment_mode;
DROP TYPE order_adjustment_type;

COMMIT;

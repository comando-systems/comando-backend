-- ADR-02, 04, 05, 06: payment request handoff, pricing snapshot, cash change,
-- catalog category/active flag, and service fee settings.

BEGIN;

CREATE TYPE order_adjustment_type AS ENUM ('DISCOUNT', 'SURCHARGE');
CREATE TYPE order_adjustment_mode AS ENUM ('PERCENT', 'FIXED');

-- Catalog (ADR-06)
ALTER TABLE items
    ADD COLUMN category VARCHAR(80) NOT NULL DEFAULT 'Uncategorized',
    ADD COLUMN active BOOLEAN NOT NULL DEFAULT TRUE,
    ADD CONSTRAINT items_category_not_blank CHECK (length(btrim(category)) > 0);

CREATE INDEX items_sellable_category_idx
    ON items (category, name)
    WHERE deleted_at IS NULL AND active;

-- Orders: payment request (ADR-02), customer label (ADR-04), pricing snapshot (ADR-05).
-- adjustment_value is basis points for PERCENT and cents for FIXED. adjustment_cents is signed.
ALTER TABLE orders
    ADD COLUMN label VARCHAR(160) NULL,
    ADD COLUMN payment_requested_at TIMESTAMPTZ NULL,
    ADD COLUMN payment_requested_by_user_id BIGINT NULL,
    ADD COLUMN adjustment_type order_adjustment_type NULL,
    ADD COLUMN adjustment_mode order_adjustment_mode NULL,
    ADD COLUMN adjustment_value BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN adjustment_cents BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN apply_service_fee BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN service_fee_basis_points INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN service_fee_cents BIGINT NOT NULL DEFAULT 0,
    ADD CONSTRAINT orders_payment_requested_by_fk
        FOREIGN KEY (payment_requested_by_user_id) REFERENCES users (id) ON DELETE RESTRICT,
    ADD CONSTRAINT orders_label_counter_only CHECK (
        label IS NULL OR order_type = 'COUNTER'
    ),
    ADD CONSTRAINT orders_awaiting_payment_table_only CHECK (
        status <> 'AWAITING_PAYMENT' OR order_type = 'TABLE'
    ),
    ADD CONSTRAINT orders_payment_request_pair CHECK (
        (payment_requested_at IS NULL) = (payment_requested_by_user_id IS NULL)
    ),
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
    ),
    ADD CONSTRAINT orders_service_fee_valid CHECK (
        service_fee_basis_points BETWEEN 0 AND 10000
        AND service_fee_cents >= 0
        AND (apply_service_fee OR (service_fee_basis_points = 0 AND service_fee_cents = 0))
    );

ALTER TABLE orders DROP CONSTRAINT orders_lifecycle_timestamps;
ALTER TABLE orders ADD CONSTRAINT orders_lifecycle_timestamps CHECK (
    (status = 'OPEN'
        AND payment_requested_at IS NULL AND closed_at IS NULL AND canceled_at IS NULL)
    OR (status = 'AWAITING_PAYMENT'
        AND payment_requested_at IS NOT NULL AND closed_at IS NULL AND canceled_at IS NULL)
    OR (status = 'CLOSED' AND closed_at IS NOT NULL AND canceled_at IS NULL)
    OR (status = 'CANCELED' AND canceled_at IS NOT NULL AND closed_at IS NULL)
);

-- A table waiting for payment is still occupied.
DROP INDEX orders_one_open_per_table_idx;
DROP INDEX orders_table_open_idx;
CREATE UNIQUE INDEX orders_one_active_per_table_idx
    ON orders (table_code)
    WHERE order_type = 'TABLE' AND status IN ('OPEN', 'AWAITING_PAYMENT');

-- Cash received and change, so receipts can show them (ADR-05).
ALTER TABLE order_payments
    ADD COLUMN received_cents BIGINT NULL,
    ADD COLUMN change_cents BIGINT NULL,
    ADD CONSTRAINT order_payments_cash_tender_pair CHECK (
        (received_cents IS NULL) = (change_cents IS NULL)
    ),
    ADD CONSTRAINT order_payments_cash_tender_cash_only CHECK (
        received_cents IS NULL OR method = 'CASH'
    ),
    ADD CONSTRAINT order_payments_cash_tender_valid CHECK (
        received_cents IS NULL
        OR (received_cents >= amount_cents AND change_cents = received_cents - amount_cents)
    );

-- Application settings (ADR-04). Singleton row: id is fixed, not a surrogate key.
-- The service fee starts off, so enabling it is a deliberate choice of the administrator.
CREATE TABLE settings (
    id SMALLINT PRIMARY KEY DEFAULT 1,
    service_fee_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    service_fee_basis_points INTEGER NOT NULL DEFAULT 1000,
    updated_by_user_id BIGINT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT settings_singleton CHECK (id = 1),
    CONSTRAINT settings_service_fee_valid CHECK (service_fee_basis_points BETWEEN 0 AND 10000),
    CONSTRAINT settings_updated_by_fk
        FOREIGN KEY (updated_by_user_id) REFERENCES users (id) ON DELETE RESTRICT
);

INSERT INTO settings (id) VALUES (1);

COMMIT;

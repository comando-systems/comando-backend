-- PostgreSQL cannot drop an enum value, so the type is recreated without it.
-- Run 005 DOWN first: it reopens any AWAITING_PAYMENT order.

BEGIN;

-- Dependents of orders.status must be dropped before the column type changes.
DROP INDEX orders_one_open_per_table_idx;
DROP INDEX orders_table_open_idx;
DROP INDEX orders_status_type_idx;
ALTER TABLE orders
    DROP CONSTRAINT orders_counter_must_be_closed,
    DROP CONSTRAINT orders_lifecycle_timestamps,
    DROP CONSTRAINT orders_closed_actor_required,
    DROP CONSTRAINT orders_canceled_actor_required;

ALTER TYPE order_status RENAME TO order_status_old;
CREATE TYPE order_status AS ENUM ('OPEN', 'CLOSED', 'CANCELED');
ALTER TABLE orders
    ALTER COLUMN status TYPE order_status USING status::TEXT::order_status;
DROP TYPE order_status_old;

ALTER TABLE orders
    ADD CONSTRAINT orders_counter_must_be_closed CHECK (
        order_type <> 'COUNTER' OR status = 'CLOSED'
    ),
    ADD CONSTRAINT orders_lifecycle_timestamps CHECK (
        (status = 'OPEN' AND closed_at IS NULL AND canceled_at IS NULL)
        OR (status = 'CLOSED' AND closed_at IS NOT NULL AND canceled_at IS NULL)
        OR (status = 'CANCELED' AND canceled_at IS NOT NULL AND closed_at IS NULL)
    ),
    ADD CONSTRAINT orders_closed_actor_required CHECK (
        status <> 'CLOSED' OR closed_by_user_id IS NOT NULL
    ),
    ADD CONSTRAINT orders_canceled_actor_required CHECK (
        status <> 'CANCELED' OR canceled_by_user_id IS NOT NULL
    );

CREATE INDEX orders_status_type_idx ON orders (status, order_type, opened_at DESC);
CREATE INDEX orders_table_open_idx
    ON orders (table_code)
    WHERE order_type = 'TABLE' AND status = 'OPEN';
CREATE UNIQUE INDEX orders_one_open_per_table_idx
    ON orders (table_code)
    WHERE order_type = 'TABLE' AND status = 'OPEN';

COMMIT;

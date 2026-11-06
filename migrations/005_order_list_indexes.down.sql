BEGIN;

DROP INDEX orders_canceled_at_idx;
DROP INDEX orders_closed_at_idx;
DROP INDEX orders_status_created_idx;

COMMIT;

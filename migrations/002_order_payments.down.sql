-- Revert order payment storage.

BEGIN;

DROP TABLE IF EXISTS order_payments;
DROP TYPE IF EXISTS payment_method;

COMMIT;

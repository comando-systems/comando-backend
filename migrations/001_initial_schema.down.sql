-- Revert the consolidated Comandô schema.
-- Drop dependent tables before referenced tables and custom enum types.

BEGIN;

DROP TABLE IF EXISTS settings;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS order_payments;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS items;
DROP TABLE IF EXISTS user_roles;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS users;

DROP TYPE IF EXISTS order_adjustment_mode;
DROP TYPE IF EXISTS order_adjustment_type;
DROP TYPE IF EXISTS payment_method;
DROP TYPE IF EXISTS order_status;
DROP TYPE IF EXISTS order_type;

COMMIT;

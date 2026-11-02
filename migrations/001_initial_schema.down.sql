-- Revert Comandô initial PostgreSQL schema.
-- Drop dependents before referenced tables and custom enum types.

BEGIN;

DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS items;
DROP TABLE IF EXISTS user_roles;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS users;

DROP TYPE IF EXISTS order_status;
DROP TYPE IF EXISTS order_type;

COMMIT;

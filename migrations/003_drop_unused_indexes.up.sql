-- Remove indexes with no matching read path. The token hash remains indexed by its unique
-- constraint; revoking all tokens of a user is an infrequent administrative operation.

BEGIN;

DROP INDEX IF EXISTS audit_logs_created_at_idx;
DROP INDEX IF EXISTS refresh_tokens_user_active_idx;

COMMIT;

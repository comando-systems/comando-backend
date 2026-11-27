BEGIN;

CREATE INDEX audit_logs_created_at_idx ON audit_logs (created_at DESC);
CREATE INDEX refresh_tokens_user_active_idx
    ON refresh_tokens (user_id, expires_at)
    WHERE revoked_at IS NULL;

COMMIT;

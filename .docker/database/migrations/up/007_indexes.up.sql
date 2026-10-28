CREATE INDEX service_sessions_status_type_idx
    ON service_sessions (status, type);

CREATE INDEX service_sessions_opened_at_idx
    ON service_sessions (opened_at);

CREATE INDEX session_items_session_status_idx
    ON session_items (session_id, status);

CREATE INDEX session_items_product_idx
    ON session_items (product_id);

CREATE INDEX payments_session_idx
    ON payments (session_id);

CREATE INDEX payments_paid_at_idx
    ON payments (paid_at);

CREATE INDEX user_roles_role_idx
    ON user_roles (role_id);

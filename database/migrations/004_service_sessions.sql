-- =========================================================
-- COUNTER AND TABLE SESSIONS
-- =========================================================

CREATE TABLE service_sessions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    type session_type NOT NULL,
    status session_status NOT NULL DEFAULT 'OPEN',

    -- Optional identifier for a physical table.
    table_number INTEGER,

    opened_by BIGINT NOT NULL REFERENCES users(id),
    closed_by BIGINT REFERENCES users(id),

    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,

    notes TEXT,

    CONSTRAINT service_sessions_table_check CHECK (
        (type = 'TABLE' AND table_number IS NOT NULL
            AND table_number > 0)
        OR
        (type = 'COUNTER' AND table_number IS NULL)
    ),

    CONSTRAINT service_sessions_close_check CHECK (
        (status = 'OPEN' AND closed_at IS NULL)
        OR
        (status IN ('CLOSED', 'CANCELLED')
            AND closed_at IS NOT NULL)
    )
);

-- Prevents two open sessions for the same physical table.
CREATE UNIQUE INDEX service_sessions_open_table_unique
    ON service_sessions (table_number)
    WHERE type = 'TABLE' AND status = 'OPEN';

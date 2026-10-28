CREATE TABLE payments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    session_id BIGINT NOT NULL
        REFERENCES service_sessions(id),

    amount NUMERIC(12, 2) NOT NULL,
    method payment_method NOT NULL,

    received_by BIGINT NOT NULL REFERENCES users(id),

    paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT,

    CONSTRAINT payments_amount_check CHECK (amount > 0)
);

CREATE TABLE session_items (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    session_id BIGINT NOT NULL
        REFERENCES service_sessions(id),

    product_id BIGINT NOT NULL
        REFERENCES products(id),

    quantity NUMERIC(10, 3) NOT NULL DEFAULT 1,
    unit_price NUMERIC(12, 2) NOT NULL,

    status session_item_status NOT NULL DEFAULT 'ACTIVE',

    added_by BIGINT NOT NULL REFERENCES users(id),
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    removed_at TIMESTAMPTZ,
    removed_by BIGINT REFERENCES users(id),

    CONSTRAINT session_items_quantity_check
        CHECK (quantity > 0),

    CONSTRAINT session_items_price_check
        CHECK (unit_price >= 0),

    CONSTRAINT session_items_removal_check CHECK (
        (status = 'ACTIVE' AND removed_at IS NULL)
        OR
        (status = 'REMOVED' AND removed_at IS NOT NULL)
    )
);

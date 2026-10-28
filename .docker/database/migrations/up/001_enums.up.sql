CREATE TYPE session_type AS ENUM (
    'COUNTER',
    'TABLE'
);

CREATE TYPE session_status AS ENUM (
    'OPEN',
    'CLOSED',
    'CANCELLED'
);

CREATE TYPE session_item_status AS ENUM (
    'ACTIVE',
    'REMOVED'
);

CREATE TYPE payment_method AS ENUM (
    'CASH',
    'CREDIT_CARD',
    'DEBIT_CARD',
    'PIX',
    'OTHER'
);

-- Comandô database schema and default data.
-- Loaded once by PostgreSQL when the data directory is first initialized.

BEGIN;

CREATE TYPE payment_method AS ENUM (
  'CASH',
  'CREDIT_CARD',
  'DEBIT_CARD',
  'PIX',
  'OTHER'
);
CREATE TYPE session_item_status AS ENUM ('ACTIVE', 'REMOVED');
CREATE TYPE session_status AS ENUM ('OPEN', 'CLOSED', 'CANCELLED');
CREATE TYPE session_type AS ENUM ('COUNTER', 'TABLE');

CREATE TABLE users (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name varchar(120) NOT NULL,
  email varchar(255) NOT NULL UNIQUE,
  password_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE roles (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name varchar(30) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_roles (
  user_id bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role_id bigint NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE products (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name varchar(150) NOT NULL,
  description text,
  price numeric(12, 2) NOT NULL CHECK (price >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE service_sessions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type session_type NOT NULL,
  status session_status NOT NULL DEFAULT 'OPEN',
  table_number integer,
  opened_by bigint NOT NULL REFERENCES users (id),
  closed_by bigint REFERENCES users (id),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  notes text,
  CONSTRAINT service_sessions_table_assignment_check CHECK (
    (type = 'TABLE' AND table_number IS NOT NULL)
    OR (type = 'COUNTER' AND table_number IS NULL)
  ),
  CONSTRAINT service_sessions_close_state_check CHECK (
    (status = 'OPEN' AND closed_at IS NULL AND closed_by IS NULL)
    OR (
      status IN ('CLOSED', 'CANCELLED')
      AND closed_at IS NOT NULL
      AND closed_by IS NOT NULL
    )
  )
);

-- At most one OPEN session per table, while preserving closed history.
CREATE UNIQUE INDEX service_sessions_open_table_unique
  ON service_sessions (table_number)
  WHERE status = 'OPEN';
CREATE INDEX service_sessions_status_idx ON service_sessions (status);

CREATE TABLE session_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id bigint NOT NULL REFERENCES service_sessions (id),
  product_id bigint NOT NULL REFERENCES products (id),
  quantity numeric(10, 3) NOT NULL DEFAULT '1' CHECK (quantity > 0),
  -- Snapshot of the product price at insertion time.
  unit_price numeric(12, 2) NOT NULL CHECK (unit_price >= 0),
  status session_item_status NOT NULL DEFAULT 'ACTIVE',
  added_by bigint NOT NULL REFERENCES users (id),
  added_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  removed_by bigint REFERENCES users (id),
  CONSTRAINT session_items_removal_state_check CHECK (
    (status = 'ACTIVE' AND removed_at IS NULL AND removed_by IS NULL)
    OR (
      status = 'REMOVED'
      AND removed_at IS NOT NULL
      AND removed_by IS NOT NULL
    )
  )
);

CREATE INDEX session_items_session_id_idx ON session_items (session_id);

CREATE TABLE payments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id bigint NOT NULL REFERENCES service_sessions (id),
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  method payment_method NOT NULL,
  received_by bigint NOT NULL REFERENCES users (id),
  paid_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

CREATE INDEX payments_session_id_idx ON payments (session_id);

INSERT INTO roles (name)
VALUES ('ADMIN'), ('CAIXA'), ('GARCOM')
ON CONFLICT (name) DO NOTHING;

COMMIT;

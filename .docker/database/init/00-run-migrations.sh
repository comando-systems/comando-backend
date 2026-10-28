#!/usr/bin/env bash
set -e

if [ -z "$POSTGRES_DB" ] || [ -z "$POSTGRES_USER" ]; then
  echo "POSTGRES_DB and POSTGRES_USER must be set"
  exit 1
fi

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'EOSQL'
\i /docker-entrypoint-initdb.d/migrations/001_enums.sql
\i /docker-entrypoint-initdb.d/migrations/002_users_roles.sql
\i /docker-entrypoint-initdb.d/migrations/003_products.sql
\i /docker-entrypoint-initdb.d/migrations/004_service_sessions.sql
\i /docker-entrypoint-initdb.d/migrations/005_session_items.sql
\i /docker-entrypoint-initdb.d/migrations/006_payments.sql
\i /docker-entrypoint-initdb.d/migrations/007_indexes.sql
\i /docker-entrypoint-initdb.d/migrations/008_seed_roles.sql
EOSQL

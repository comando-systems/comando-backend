#!/usr/bin/env bash
set -e

for f in /docker-entrypoint-initdb.d/migrations/up/*.sql; do
  [ -e "$f" ] || continue
  echo "Running $f"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$f"
done

#!/usr/bin/env bash
# Startup smoke test: the server must boot and answer the basic routes.
set -euo pipefail

base="${1:?usage: smoke-test.sh <base-url>}"

for attempt in $(seq 1 30); do
  curl -fsS "$base/health" >/dev/null 2>&1 && break
  if [ "$attempt" -eq 30 ]; then
    echo "server did not start at $base" >&2
    exit 1
  fi
  sleep 1
done

expect() {
  local path="$1" want="$2" got
  got="$(curl -s -o /dev/null -w '%{http_code}' "$base$path")"
  if [ "$got" != "$want" ]; then
    echo "$path returned $got, expected $want" >&2
    exit 1
  fi
  echo "$path -> $got"
}

expect /health 200
expect /health/ready 200
expect /items 401
expect /unknown-route 404

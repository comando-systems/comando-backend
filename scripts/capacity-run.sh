#!/usr/bin/env bash
# Runs k6/capacity-test.js once per step of concurrent users, then reports the percentiles of
# every endpoint and the highest step that stayed inside the budget.
#
#   scripts/capacity-run.sh <base-url> "25 50 100 200" <duration> <think-seconds> <stop-on-break>
#
# Needs jq and Docker. LOAD_EMAIL and LOAD_PASSWORD must be set.
set -euo pipefail

base="${1:?usage: capacity-run.sh <base-url> <steps> <duration> <think> <stop-on-break>}"
steps="${2:?}"
duration="${3:-60s}"
think="${4:-1}"
stop_on_break="${5:-true}"

# p95 < 500 ms, p99 < 1 s and fewer than 1% failed requests, for every endpoint.
budget='[.metrics | to_entries[]
  | select(.key | test("^http_req_duration\\{endpoint:(items|orders|order_create|health|login)\\}$"))
  | .value | (.["p(95)"] < 500 and .["p(99)"] < 1000)] | all'

mkdir -p capacity
summary="${GITHUB_STEP_SUMMARY:-/dev/stdout}"
best=0

{
  echo "### Capacity run"
  echo
  echo "Concurrent users loop through reads and sales with about ${think}s of think time. API, PostgreSQL and k6 share one CI runner, so this is a floor, not a production limit."
  echo
  echo "| Users | Requests | req/s | Failed | Budget |"
  echo "|---|---|---|---|---|"
} >> "$summary"

for users in $steps; do
  echo "== ${users} concurrent users"
  docker run --rm --network host --user "$(id -u):$(id -g)" \
    -v "$PWD/k6:/k6:ro" -v "$PWD/capacity:/out" \
    -e BASE_URL="$base" -e LOAD_EMAIL -e LOAD_PASSWORD \
    -e VUS="$users" -e DURATION="$duration" -e THINK_SECONDS="$think" \
    grafana/k6:2.2.0 run --summary-export="/out/step-${users}.json" /k6/capacity-test.js || true

  file="capacity/step-${users}.json"
  [ -s "$file" ] || { echo "no summary for ${users} users" >&2; break; }

  failed="$(jq -r '.metrics.http_req_failed.value // .metrics.http_req_failed.rate // 0' "$file")"
  ok="$(jq -r "$budget" "$file")"
  [ "$(jq -n "$failed < 0.01")" = true ] || ok=false

  {
    echo "| ${users} | $(jq -r '.metrics.http_reqs.count' "$file") | $(jq -r '.metrics.http_reqs.rate | floor' "$file") | ${failed} | $([ "$ok" = true ] && echo within || echo BROKEN) |"
  } >> "$summary"

  if [ "$ok" = true ]; then
    best="$users"
  elif [ "$stop_on_break" = true ]; then
    break
  fi
done

{
  echo
  echo "**Highest step within the budget: ${best} concurrent users.**"
  echo
  echo "#### Latency per endpoint and step (ms)"
  echo
  echo "| Users | Endpoint | avg | p90 | p95 | p99 | max |"
  echo "|---|---|---|---|---|---|---|"
  for file in capacity/step-*.json; do
    users="$(basename "$file" .json | sed 's/step-//')"
    jq -r --arg users "$users" '.metrics | to_entries[]
      | select(.key | test("^http_req_duration\\{endpoint:"))
      | "| \($users) | \(.key | sub("http_req_duration\\{endpoint:"; "") | sub("\\}"; "")) | \(.value.avg | floor) | \(.value["p(90)"] | floor) | \(.value["p(95)"] | floor) | \(.value["p(99)"] | floor) | \(.value.max | floor) |"' "$file"
  done | sort -t'|' -k2,2n -k3,3
} >> "$summary"

echo "best=${best}" >> "${GITHUB_OUTPUT:-/dev/null}"

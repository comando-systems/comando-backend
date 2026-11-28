// Load test for the API. Every endpoint is held to the same latency budget:
// p95 < 500 ms and p99 < 1 s, with fewer than 1% failed requests.
//
//   k6 run -e BASE_URL=http://localhost:3000 \
//          -e LOAD_EMAIL=load@example.com -e LOAD_PASSWORD=... k6/load-test.js
//
// The user must already exist with the ADMIN, CASHIER, and SERVER roles
// (ROOT_EMAIL/ROOT_PASSWORD with bun run db:seed-root). Start the API with a high
// LOGIN_RATE_LIMIT_MAX, otherwise the login rate limit (429) will fail the run.
import { check, sleep } from 'k6';
import http from 'k6/http';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const EMAIL = __ENV.LOAD_EMAIL;
const PASSWORD = __ENV.LOAD_PASSWORD;

// Deterministic per-VU pacing: load tests must be reproducible, not pseudorandom.
let browseIterations = 0;

const BUDGET = ['p(95)<500', 'p(99)<1000'];

export const options = {
  // The report and the capacity runs compare p90, p95, and p99.
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  scenarios: {
    // Authenticated reads: the bulk of the traffic.
    browse: {
      executor: 'ramping-vus',
      exec: 'browse',
      stages: [
        { duration: '20s', target: 20 },
        { duration: '60s', target: 20 },
        { duration: '10s', target: 0 },
      ],
    },
    // Login hashes with Argon2id, the most expensive route. Real users sign in rarely, so it runs
    // at a fixed rate: the cost stays predictable and the budget still applies.
    login: {
      executor: 'constant-arrival-rate',
      exec: 'login',
      rate: 2,
      timeUnit: '1s',
      duration: '90s',
      preAllocatedVUs: 4,
      maxVUs: 10,
    },
  },
  thresholds: {
    // A run that sent (almost) nothing must not pass on empty latency numbers.
    http_reqs: ['count>500'],
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
    http_req_duration: BUDGET,
    'http_req_duration{endpoint:health}': BUDGET,
    'http_req_duration{endpoint:ready}': BUDGET,
    'http_req_duration{endpoint:items}': BUDGET,
    'http_req_duration{endpoint:orders}': BUDGET,
    'http_req_duration{endpoint:login}': BUDGET,
  },
};

function signIn(tags) {
  return http.post(`${BASE_URL}/auth/login`, JSON.stringify({ email: EMAIL, password: PASSWORD }), {
    headers: { 'Content-Type': 'application/json' },
    tags,
  });
}

export function setup() {
  if (!EMAIL || !PASSWORD) {
    throw new Error('LOAD_EMAIL and LOAD_PASSWORD are required');
  }

  const response = signIn({ endpoint: 'setup' });
  if (response.status !== 200) {
    throw new Error(`Could not log in for the load test (status ${response.status})`);
  }

  return { token: response.json('accessToken') };
}

export function browse(data) {
  const headers = { Authorization: `Bearer ${data.token}` };

  const health = http.get(`${BASE_URL}/health`, { tags: { endpoint: 'health' } });
  check(health, { 'health is 200': (r) => r.status === 200 });

  const items = http.get(`${BASE_URL}/items?page=1&pageSize=20`, {
    headers,
    tags: { endpoint: 'items' },
  });
  check(items, { 'items is 200': (r) => r.status === 200 });

  const orders = http.get(`${BASE_URL}/orders?page=1&pageSize=20`, {
    headers,
    tags: { endpoint: 'orders' },
  });
  check(orders, { 'orders is 200': (r) => r.status === 200 });

  browseIterations += 1;

  if (browseIterations % 5 === 0) {
    const ready = http.get(`${BASE_URL}/health/ready`, { tags: { endpoint: 'ready' } });
    check(ready, { 'ready is 200': (r) => r.status === 200 });
  }

  sleep(0.2 + (browseIterations % 3) * 0.1);
}

export function login() {
  const response = signIn({ endpoint: 'login' });
  check(response, { 'login is 200': (r) => r.status === 200 });
}

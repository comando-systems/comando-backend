// Capacity probe: one fixed number of concurrent users for one step. The capacity workflow runs
// it once per step and compares the percentiles of each endpoint with the budget.
//
//   k6 run -e BASE_URL=http://localhost:3000 -e LOAD_EMAIL=... -e LOAD_PASSWORD=... \
//          -e VUS=100 -e DURATION=60s -e THINK_SECONDS=1 k6/capacity-test.js
//
// A "user" is a virtual user looping through a till/waiter workload with think time between
// actions, so VUS is the number of people using the system at the same moment, not requests/s.
import { check, sleep } from 'k6';
import http from 'k6/http';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const EMAIL = __ENV.LOAD_EMAIL;
const PASSWORD = __ENV.LOAD_PASSWORD;
const THINK = Number(__ENV.THINK_SECONDS || 1);

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  scenarios: {
    users: {
      executor: 'ramping-vus',
      exec: 'user',
      stages: [
        { duration: __ENV.RAMP || '10s', target: Number(__ENV.VUS || 10) },
        { duration: __ENV.DURATION || '60s', target: Number(__ENV.VUS || 10) },
      ],
    },
    // Sign-ins are rare but the most expensive route (Argon2id), so a few always run.
    signins: {
      executor: 'constant-arrival-rate',
      exec: 'signin',
      rate: 1,
      timeUnit: '1s',
      duration: '70s',
      preAllocatedVUs: 2,
      maxVUs: 20,
    },
  },
  // Recorded, never enforced: the workflow decides what broke the budget.
  thresholds: {
    'http_req_duration{endpoint:items}': ['p(99)<1e9'],
    'http_req_duration{endpoint:orders}': ['p(99)<1e9'],
    'http_req_duration{endpoint:order_create}': ['p(99)<1e9'],
    'http_req_duration{endpoint:health}': ['p(99)<1e9'],
    'http_req_duration{endpoint:login}': ['p(99)<1e9'],
  },
};

const json = { 'Content-Type': 'application/json' };

export function setup() {
  if (!EMAIL || !PASSWORD) {
    throw new Error('LOAD_EMAIL and LOAD_PASSWORD are required');
  }

  const login = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    {
      headers: json,
    },
  );
  if (login.status !== 200) {
    throw new Error(`Could not log in (status ${login.status})`);
  }

  const token = login.json('accessToken');
  const item = http.post(
    `${BASE_URL}/items`,
    JSON.stringify({ name: `Capacity item ${Date.now()}`, priceCents: 1000 }),
    { headers: { ...json, Authorization: `Bearer ${token}` } },
  );
  if (item.status !== 201) {
    throw new Error(`Could not create the item (status ${item.status})`);
  }

  return { token, itemId: item.json('id') };
}

export function user(data) {
  const headers = { ...json, Authorization: `Bearer ${data.token}` };

  const items = http.get(`${BASE_URL}/items?page=1&pageSize=20`, {
    headers,
    tags: { endpoint: 'items' },
  });
  check(items, { 'items is 200': (r) => r.status === 200 });
  sleep(THINK * (0.5 + Math.random()));

  const orders = http.get(`${BASE_URL}/orders?page=1&pageSize=20`, {
    headers,
    tags: { endpoint: 'orders' },
  });
  check(orders, { 'orders is 200': (r) => r.status === 200 });
  sleep(THINK * (0.5 + Math.random()));

  // About one iteration in five rings up a sale: the write path with its transaction and audit row.
  if (Math.random() < 0.2) {
    const sale = http.post(
      `${BASE_URL}/orders/counter`,
      JSON.stringify({
        items: [{ itemId: data.itemId, quantity: 1 }],
        payments: [{ method: 'PIX', amountCents: 1000 }],
      }),
      { headers, tags: { endpoint: 'order_create' } },
    );
    check(sale, { 'sale is 201': (r) => r.status === 201 });
  }

  if (Math.random() < 0.1) {
    const health = http.get(`${BASE_URL}/health`, { tags: { endpoint: 'health' } });
    check(health, { 'health is 200': (r) => r.status === 200 });
  }
}

export function signin() {
  const response = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    {
      headers: json,
      tags: { endpoint: 'login' },
    },
  );
  check(response, { 'login is 200': (r) => r.status === 200 });
}

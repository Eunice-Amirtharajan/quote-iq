/**
 * k6 load test — QuoteIQ quotation search
 *
 * Tests the ILIKE search path in quotations.service.ts findAll() against
 * the production Neon DB (50k rows, GIN trigram indexes applied).
 *
 * Usage — EMAIL and PASSWORD are required, no default credentials are baked in:
 *   k6 run backend/load-tests/search.js \
 *     -e BASE_URL=https://api.quoteiq.cc \
 *     -e EMAIL=<test-account-email> \
 *     -e PASSWORD=<test-account-password> \
 *     --vus 20 --duration 30s
 *
 * Install k6: https://k6.io/docs/get-started/installation/
 *   Windows:  winget install k6 --source winget
 *   Mac:      brew install k6
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';
const EMAIL = __ENV.EMAIL;
const PASSWORD = __ENV.PASSWORD;

if (!EMAIL || !PASSWORD) {
  throw new Error(
    'EMAIL and PASSWORD env vars are required — pass with -e EMAIL=... -e PASSWORD=... (no default credentials are baked into this script).',
  );
}

// Search terms that exercise the trigram index across all three columns
const SEARCH_TERMS = [
  'Cloud',
  'Security',
  'Data',
  'Migration',
  'Infrastructure',
  'Platform',
  'Analytics',
  'Integration',
];

// ---------------------------------------------------------------------------
// Custom metrics
// ---------------------------------------------------------------------------
const searchDuration = new Trend('search_duration', true); // true = milliseconds
const errorRate      = new Rate('error_rate');

// ---------------------------------------------------------------------------
// Load profile
// ---------------------------------------------------------------------------
export const options = {
  stages: [
    { duration: '10s', target: 5  },  // ramp up
    { duration: '30s', target: 20 },  // sustained load — 20 VUs
    { duration: '10s', target: 0  },  // ramp down
  ],
  thresholds: {
    // p95 under 200ms with GIN indexes at 50k rows
    search_duration: ['p(95)<200'],
    // fewer than 1% errors
    error_rate: ['rate<0.01'],
    // built-in http duration also tracked
    http_req_duration: ['p(95)<200'],
  },
};

// ---------------------------------------------------------------------------
// Setup — runs once, logs in and returns the auth cookie for all VUs
// ---------------------------------------------------------------------------
export function setup() {
  const loginRes = http.post(
    `${BASE_URL}/graphql`,
    JSON.stringify({
      query: `
        mutation Login($email: String!, $password: String!) {
          login(email: $email, password: $password) { id role }
        }
      `,
      variables: { email: EMAIL, password: PASSWORD },
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  check(loginRes, { 'login 200': (r) => r.status === 200 });

  const body = JSON.parse(loginRes.body);
  if (body.errors) {
    throw new Error(`Login failed: ${JSON.stringify(body.errors)}`);
  }

  // Extract the HttpOnly cookie (access_token=...; Path=/; HttpOnly; ...)
  const cookieHeader = loginRes.headers['Set-Cookie'] || '';
  const cookie = cookieHeader.split(';')[0]; // "access_token=<jwt>"
  return { cookie };
}

// ---------------------------------------------------------------------------
// Default function — runs per VU per iteration
// ---------------------------------------------------------------------------
export default function (data) {
  const term = SEARCH_TERMS[Math.floor(Math.random() * SEARCH_TERMS.length)];

  const res = http.post(
    `${BASE_URL}/graphql`,
    JSON.stringify({
      query: `
        query Quotations($take: Int, $skip: Int, $filter: QuotationFilterInput) {
          quotations(take: $take, skip: $skip, filter: $filter) {
            id
            quotationNumber
            title
            clientName
            status
            total
            createdAt
          }
        }
      `,
      variables: {
        take: 20,
        skip: 0,
        filter: { search: term },
      },
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        Cookie: data.cookie,
      },
    },
  );

  const ok = check(res, {
    'status 200':     (r) => r.status === 200,
    'no gql errors':  (r) => !JSON.parse(r.body).errors,
    'has results':    (r) => {
      const b = JSON.parse(r.body);
      return Array.isArray(b?.data?.quotations);
    },
  });

  searchDuration.add(res.timings.duration);
  errorRate.add(!ok);

  sleep(0.5); // 500ms think-time between iterations per VU
}

// ---------------------------------------------------------------------------
// Teardown — summary printed by k6 automatically after run
// ---------------------------------------------------------------------------
export function teardown() {
  console.log('\nLoad test complete. Key metrics to record:');
  console.log('  search_duration p50 / p95 / p99');
  console.log('  http_req_duration p95 (overall)');
  console.log('  error_rate (target < 1%)');
}

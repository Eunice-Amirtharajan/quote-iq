// k6 load test — hammers /graphql to trigger HPA scale-up on the cluster.
// Usage: k6 run k8s/load-test.js -e BASE_URL=http://<cluster-ip-or-domain>
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';

export const options = {
  stages: [
    { duration: '30s', target: 30 },   // ramp up
    { duration: '3m',  target: 100 },  // hold at 100 VUs — heavier load to breach 60% CPU
    { duration: '30s', target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_failed:   ['rate<0.10'],
    http_req_duration: ['p(95)<3000'],
  },
};

const GQL_QUERY = JSON.stringify({
  query: `{ __typename }`,
});

export default function () {
  // GraphQL introspection is heavier than /health — more CPU per request
  const res = http.post(
    `${BASE_URL}/graphql`,
    GQL_QUERY,
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(res, { 'status 200': (r) => r.status === 200 });
  sleep(0.05); // tighter loop = more pressure
}

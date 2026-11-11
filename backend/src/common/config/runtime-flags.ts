type Env = Record<string, string | undefined>;

/**
 * How many proxies in front of the app to trust for X-Forwarded-For. Without it, req.ip is the
 * proxy's address, so the throttler would put every client in one bucket. Production defaults to 1
 * (Railway's edge proxy); set TRUST_PROXY_HOPS when there are more hops (e.g. a cloud load
 * balancer plus an ingress). Trusting more hops than exist lets a client choose its own IP by
 * sending X-Forwarded-For, so 0 (trust none) is the default everywhere else.
 */
export function trustProxyHops(env: Env): number {
  const raw = env.TRUST_PROXY_HOPS;
  if (raw === undefined || raw === '') {
    return env.NODE_ENV === 'production' ? 1 : 0;
  }
  const hops = Number(raw);
  if (!Number.isInteger(hops) || hops < 0) {
    throw new Error(
      `TRUST_PROXY_HOPS must be a whole number of 0 or more, got "${raw}"`,
    );
  }
  return hops;
}

/**
 * The test-only token endpoint needs an explicit opt-in as well as a non-production NODE_ENV, so a
 * deployment that forgets to set NODE_ENV can't expose invite and reset tokens.
 */
export function testEndpointsEnabled(env: Env): boolean {
  return env.NODE_ENV !== 'production' && env.ENABLE_TEST_ENDPOINTS === 'true';
}

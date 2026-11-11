import { testEndpointsEnabled, trustProxyHops } from './runtime-flags';

describe('trustProxyHops', () => {
  it('trusts one hop in production by default (Railway edge proxy)', () => {
    expect(trustProxyHops({ NODE_ENV: 'production' })).toBe(1);
  });

  it('trusts no proxy outside production by default', () => {
    expect(trustProxyHops({ NODE_ENV: 'development' })).toBe(0);
    expect(trustProxyHops({})).toBe(0);
  });

  it('uses TRUST_PROXY_HOPS when set, including 0', () => {
    expect(
      trustProxyHops({ NODE_ENV: 'production', TRUST_PROXY_HOPS: '2' }),
    ).toBe(2);
    expect(
      trustProxyHops({ NODE_ENV: 'production', TRUST_PROXY_HOPS: '0' }),
    ).toBe(0);
  });

  it.each(['-1', '1.5', 'true', 'abc'])(
    'fails at boot on an invalid value (%s)',
    (value) => {
      expect(() => trustProxyHops({ TRUST_PROXY_HOPS: value })).toThrow(
        'TRUST_PROXY_HOPS',
      );
    },
  );
});

describe('testEndpointsEnabled', () => {
  it('is on only with ENABLE_TEST_ENDPOINTS=true outside production', () => {
    expect(
      testEndpointsEnabled({
        NODE_ENV: 'development',
        ENABLE_TEST_ENDPOINTS: 'true',
      }),
    ).toBe(true);
  });

  it('is off when NODE_ENV is missing or not production but the flag is absent', () => {
    expect(testEndpointsEnabled({})).toBe(false);
    expect(testEndpointsEnabled({ NODE_ENV: 'development' })).toBe(false);
    expect(
      testEndpointsEnabled({
        NODE_ENV: 'development',
        ENABLE_TEST_ENDPOINTS: '1',
      }),
    ).toBe(false);
  });

  it('is always off in production, even with the flag', () => {
    expect(
      testEndpointsEnabled({
        NODE_ENV: 'production',
        ENABLE_TEST_ENDPOINTS: 'true',
      }),
    ).toBe(false);
  });
});

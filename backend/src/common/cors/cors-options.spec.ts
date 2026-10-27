import { corsOptions } from './cors-options';

type OriginFn = (
  origin: string | undefined,
  cb: (err: Error | null, allow?: boolean) => void,
) => void;

const check = (allowed: string | undefined, origin: string | undefined) => {
  const cb = jest.fn();
  (corsOptions(allowed).origin as OriginFn)(origin, cb);
  return cb.mock.calls[0] as [Error | null, boolean?];
};

describe('corsOptions', () => {
  it('allows every custom header the frontend sends, including Idempotency-Key', () => {
    expect(corsOptions('http://localhost:5173').allowedHeaders).toEqual([
      'Content-Type',
      'Authorization',
      'Apollo-Require-Preflight',
      'idempotency-key',
    ]);
  });

  it('allows listed origins, comma-separated with spaces', () => {
    const allowed = 'https://quoteiq.cc, http://localhost:5173';
    expect(check(allowed, 'http://localhost:5173')).toEqual([null, true]);
    expect(check(allowed, 'https://quoteiq.cc')).toEqual([null, true]);
  });

  it('allows requests without an Origin header', () => {
    expect(check('https://quoteiq.cc', undefined)).toEqual([null, true]);
  });

  it('rejects other origins, and every origin when none is configured', () => {
    expect(check('https://quoteiq.cc', 'https://evil.example')[0]).toEqual(
      new Error('Not allowed by CORS'),
    );
    expect(check(undefined, 'https://quoteiq.cc')[0]).toBeInstanceOf(Error);
  });
});

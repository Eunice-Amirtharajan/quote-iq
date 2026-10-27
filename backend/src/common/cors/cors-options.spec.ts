import { ForbiddenException } from '@nestjs/common';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import type { Request } from 'express';
import { corsOptions } from './cors-options';

const ALLOWED = 'https://quoteiq.cc, http://localhost:5173';

const run = (
  headers: Record<string, string>,
  method = 'POST',
  allowed: string | undefined = ALLOWED,
) => {
  const callback = jest.fn();
  corsOptions(allowed)({ method, headers } as unknown as Request, callback);
  const [err, options] = callback.mock.calls[0] as [Error | null, CorsOptions];
  return { err, options };
};

describe('corsOptions', () => {
  it('allows every custom header the frontend sends, including Idempotency-Key', () => {
    expect(
      run({ origin: 'http://localhost:5173' }).options.allowedHeaders,
    ).toEqual([
      'Content-Type',
      'Authorization',
      'Apollo-Require-Preflight',
      'idempotency-key',
    ]);
  });

  it('allows listed origins, comma-separated with spaces', () => {
    expect(run({ origin: 'http://localhost:5173' }).err).toBeNull();
    expect(run({ origin: 'https://quoteiq.cc' }).err).toBeNull();
  });

  it('allows requests without an Origin header (probes, curl, same-origin)', () => {
    expect(run({}).err).toBeNull();
    expect(run({ 'sec-fetch-site': 'same-site' }).err).toBeNull();
  });

  it('rejects other origins with a 403, not a server error', () => {
    const { err } = run({ origin: 'https://evil.example' });
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err?.message).toBe('Origin not allowed');
  });

  it('rejects every origin when none is configured', () => {
    expect(
      run({ origin: 'https://quoteiq.cc' }, 'POST', '').err,
    ).toBeInstanceOf(ForbiddenException);
  });

  it('rejects a cross-site write that carries no Origin', () => {
    const { err } = run({ 'sec-fetch-site': 'cross-site' });
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err?.message).toBe('Cross-site request blocked');
  });

  it('lets a cross-site GET without Origin through (Apollo csrfPrevention covers GraphQL GETs)', () => {
    expect(run({ 'sec-fetch-site': 'cross-site' }, 'GET').err).toBeNull();
  });
});

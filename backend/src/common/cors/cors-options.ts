import { ForbiddenException } from '@nestjs/common';
import type {
  CorsOptions,
  CorsOptionsDelegate,
} from '@nestjs/common/interfaces/external/cors-options.interface';
import type { Request } from 'express';
import { IDEMPOTENCY_HEADER } from '../../modules/idempotency/idempotency.service';

// Methods a browser can send cross-site without a preflight, and that change state
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CORS and CSRF checks for the browser frontend, which runs on a different origin. Every custom
 * request header the frontend sends must be listed in allowedHeaders, or the browser's preflight
 * blocks the request -- server-side tests (supertest) never send a preflight, so they can't catch
 * a miss. The auth cookie is SameSite=None, so a foreign site's request carries it: those are
 * rejected here, before any route runs. GraphQL GETs and simple requests are covered by Apollo's
 * csrfPrevention (app.module.ts).
 */
export function corsOptions(
  corsOrigin: string | undefined,
): CorsOptionsDelegate<Request> {
  const allowedOrigins = new Set(
    (corsOrigin ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  );
  const options: CorsOptions = {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Apollo-Require-Preflight',
      IDEMPOTENCY_HEADER,
    ],
  };
  return (req, callback) => {
    const origin = req.headers.origin;
    if (origin && !allowedOrigins.has(origin)) {
      // 403, not a 500: a foreign origin is a client problem, and shouldn't log as a server error
      callback(new ForbiddenException('Origin not allowed'), options);
      return;
    }
    // No Origin is normal for health probes, curl and same-origin requests, but a browser that
    // says the request came from another site, without saying which, is a forged write
    if (
      !origin &&
      UNSAFE_METHODS.has(req.method) &&
      req.headers['sec-fetch-site'] === 'cross-site'
    ) {
      callback(new ForbiddenException('Cross-site request blocked'), options);
      return;
    }
    callback(null, options);
  };
}

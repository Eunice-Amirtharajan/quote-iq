import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { IDEMPOTENCY_HEADER } from '../../modules/idempotency/idempotency.service';

/**
 * CORS for the browser frontend, which runs on a different origin. Every custom request header
 * the frontend sends must be listed in allowedHeaders, or the browser's preflight blocks the
 * request -- server-side tests (supertest) never send a preflight, so they can't catch a miss.
 */
export function corsOptions(corsOrigin: string | undefined): CorsOptions {
  const allowedOrigins = new Set(
    (corsOrigin ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  );
  return {
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Allow requests with no Origin header (Railway health checks, curl, same-origin)
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Apollo-Require-Preflight',
      IDEMPOTENCY_HEADER,
    ],
  };
}

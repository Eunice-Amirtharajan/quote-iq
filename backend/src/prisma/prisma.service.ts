import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

// Required for Node.js — the serverless package uses native WebSocket in browsers
// but needs ws in Node.js environments (Railway, local dev).
neonConfig.webSocketConstructor = ws;

interface SimpleLogger {
  warn(message: string, context?: string): void;
}

export const RETRYABLE_CODES = ['P1001', 'P1002', 'P1008', 'P1017'];

export function isDbConnectionError(err: unknown): boolean {
  if (err === null || typeof err !== 'object') return false;
  const code = (err as { code?: string }).code;
  const message = (err as { message?: string }).message ?? '';
  return (
    (!!code && RETRYABLE_CODES.includes(code)) ||
    message.includes("Can't reach database") ||
    message.includes('Connection refused') ||
    message.includes('ECONNREFUSED')
  );
}

export async function withDbRetry<T>(
  fn: () => Promise<T>,
  logger: SimpleLogger,
  maxRetries = 8,
  baseDelayMs = 2000,
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (isDbConnectionError(err) && attempt < maxRetries) {
        const delay = Math.min(baseDelayMs * attempt, 15000);
        logger.warn(
          `DB connection error (attempt ${attempt}/${maxRetries}) — retrying in ${delay}ms`,
        );
        await new Promise((r) => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
  throw new Error('unreachable');
}

function isNeonUrl(url: string): boolean {
  return url.includes('neon.tech') || url.includes('neon.database');
}

const DEFAULT_POOL_MAX = 10;

/**
 * Connections each instance may hold (DATABASE_POOL_MAX, default 10: the Neon pool's own
 * default, now explicit). Size it so that instances × pool max, plus a few for migrations and
 * admin sessions, stays under the database's max_connections; beyond that, use Neon's pooled
 * (-pooler, PgBouncer) endpoint rather than a bigger pool. ADR §22.
 */
export function poolMax(value = process.env.DATABASE_POOL_MAX): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_POOL_MAX;
}

/** Prisma's TCP engine reads its pool size from the URL; an explicit value in the URL wins. */
export function withConnectionLimit(url: string, max: number): string {
  const parsed = new URL(url);
  if (!parsed.searchParams.has('connection_limit')) {
    parsed.searchParams.set('connection_limit', String(max));
  }
  return parsed.toString();
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is not set');
    const max = poolMax();

    if (isNeonUrl(connectionString)) {
      // Neon serverless: WebSocket adapter — full transaction support, lower
      // latency than HTTP for multi-query operations (single round-trip per
      // query over a persistent WebSocket, vs. one HTTP request each).
      // PrismaNeon manages the Pool internally from this config.
      const adapter = new PrismaNeon({ connectionString, max });
      super({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);
    } else {
      // Local / CI Docker PostgreSQL: use standard TCP driver
      super({ datasourceUrl: withConnectionLimit(connectionString, max) });
    }
    this.logger.log(`Database pool: up to ${max} connections per instance`);
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

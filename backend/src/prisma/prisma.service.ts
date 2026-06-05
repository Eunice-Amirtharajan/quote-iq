import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

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

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is not set');

    if (isNeonUrl(connectionString)) {
      // Neon serverless: WebSocket adapter — full transaction support, lower
      // latency than HTTP for multi-query operations (single round-trip per
      // query over a persistent WebSocket, vs. one HTTP request each).
      // PrismaNeon manages the Pool internally; pass the connection string directly.
      const adapter = new PrismaNeon({ connectionString });
      super({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);
    } else {
      // Local / CI Docker PostgreSQL: use standard TCP driver
      super({ datasourceUrl: connectionString });
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

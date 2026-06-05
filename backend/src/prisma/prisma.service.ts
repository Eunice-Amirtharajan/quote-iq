import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaNeonHttp } from '@prisma/adapter-neon';

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

@Injectable()
// PrismaNeonHttp uses Neon's HTTP API instead of a persistent TCP connection.
// Each query is a fresh HTTP request — no connection pool to time out when Neon pauses.
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is not set');
    const adapter = new PrismaNeonHttp(connectionString, { arrayMode: false, fullResults: false });
    super({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

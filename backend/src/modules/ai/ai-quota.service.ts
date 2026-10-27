import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Counter } from 'prom-client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppLogger } from '../../common/logger/logger.service';
import { describeError } from '../../common/helper/helper';

const MINUTE_MS = 60_000;

/** The user an AI request runs for, so token metering deep in AIService can charge them. */
const aiUserStore = new AsyncLocalStorage<string>();

export function runAsAiUser<T>(userId: string, fn: () => T): T {
  return aiUserStore.run(userId, fn);
}

export function currentAiUser(): string | undefined {
  return aiUserStore.getStore();
}

/**
 * Per-user limits on AI requests: a per-minute rate (in memory, per instance — like the global
 * throttler) and a daily token budget (in Postgres, shared by all instances). Background work,
 * e.g. embeddings in the queue consumer, runs outside a user context and isn't charged.
 */
@Injectable()
export class AiQuotaService {
  private readonly requestsPerMinute = positiveInt(
    process.env.AI_REQUESTS_PER_MINUTE,
    20,
  );
  private readonly dailyTokenBudget = positiveInt(
    process.env.AI_DAILY_TOKEN_BUDGET,
    200_000,
  );
  private readonly windows = new Map<
    string,
    { startedAt: number; count: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
    @InjectMetric('ai_quota_rejections_total')
    private readonly rejections: Counter<string>,
  ) {}

  /** Throws 429 when the user is over the per-minute rate or today's token budget. */
  async assertAllowed(userId: string): Promise<void> {
    const now = Date.now();
    const window = this.windows.get(userId);
    if (!window || now - window.startedAt >= MINUTE_MS) {
      this.windows.set(userId, { startedAt: now, count: 1 });
    } else if (window.count >= this.requestsPerMinute) {
      const waitSeconds = Math.ceil(
        (window.startedAt + MINUTE_MS - now) / 1000,
      );
      this.rejections.inc({ reason: 'rate' });
      throw tooManyRequests(
        `Too many AI requests. Try again in ${waitSeconds}s.`,
      );
    } else {
      window.count += 1;
    }

    const usage = await this.prisma.aiUsage.findUnique({
      where: { userId_day: { userId, day: utcDay() } },
    });
    if ((usage?.tokens ?? 0) >= this.dailyTokenBudget) {
      this.rejections.inc({ reason: 'budget' });
      throw tooManyRequests(
        "You've reached today's AI limit. It resets at midnight UTC.",
      );
    }
  }

  /** Adds tokens to the user's total for today. Never fails the AI request it belongs to. */
  async record(userId: string, tokens: number): Promise<void> {
    if (tokens <= 0) return;
    const day = utcDay();
    try {
      await this.prisma.aiUsage.upsert({
        where: { userId_day: { userId, day } },
        create: { userId, day, tokens },
        update: { tokens: { increment: tokens } },
      });
    } catch (err) {
      this.logger.warn(
        `AI usage not recorded for user ${userId}: ${describeError(err)}`,
        AiQuotaService.name,
      );
    }
  }
}

/**
 * A 429 shaped like Nest's built-in exceptions (an object body with statusCode). Over GraphQL,
 * Nest only forwards the HTTP status (extensions.status, which the frontend reads) for
 * exceptions with such a body; new HttpException('text', 429) arrives without it.
 */
function tooManyRequests(message: string): HttpException {
  return new HttpException(
    HttpException.createBody(
      message,
      'Too Many Requests',
      HttpStatus.TOO_MANY_REQUESTS,
    ),
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

/** Today's date in UTC, as stored in the DATE column. */
function utcDay(): Date {
  return new Date(new Date().toISOString().slice(0, 10));
}

function positiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

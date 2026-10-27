import { describeError } from '../common/helper/helper';

interface WarmUpLogger {
  info(message: string, context?: string): void;
  warn(message: string, context?: string): void;
}

const CONTEXT = 'DatabaseWarmUp';

/**
 * Wakes the database before the app takes traffic. Neon suspends after ~5 min idle; the first
 * queries during resume can fail with "Connection terminated unexpectedly", so without this the
 * first requests and the outbox relay after a restart fail. Never throws: if the database stays
 * unreachable the app still starts, and /health/ready reports it.
 */
export async function warmUpDatabase(
  ping: () => Promise<unknown>,
  logger: WarmUpLogger,
  { attempts = 3, delayMs = 2_000 } = {},
): Promise<boolean> {
  const started = Date.now();
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await ping();
      logger.info(
        `Database ready in ${Date.now() - started}ms (attempt ${attempt})`,
        CONTEXT,
      );
      return true;
    } catch (err) {
      logger.warn(
        `Database not ready (attempt ${attempt}/${attempts}): ${summarize(err)}`,
        CONTEXT,
      );
      if (attempt < attempts) await sleep(delayMs);
    }
  }
  return false;
}

// Prisma messages start with a blank line and an "Invalid invocation" header; the cause is last
function summarize(err: unknown): string {
  if (!(err instanceof Error)) return describeError(err);
  const lines = err.message
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.at(-1) ?? err.name;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

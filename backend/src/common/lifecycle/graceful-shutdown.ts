import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { describeError } from '../helper/helper';

const CONTEXT = 'GracefulShutdown';
const IN_FLIGHT_POLL_MS = 100;

interface ShutdownLogger {
  info(message: string, context?: string): void;
  error(message: string, trace?: string, context?: string): void;
}

export interface GracefulShutdownOptions {
  /** Time between failing readiness and closing the server, so the load balancer stops routing here */
  drainDelayMs: number;
  /** Hard limit for the whole shutdown; keep it below the platform's kill timeout (k8s: 30s) */
  timeoutMs: number;
  logger: ShutdownLogger;
  /** Called first, e.g. to make the readiness probe return 503 */
  onShutdownStart: () => void;
  exit?: (code: number) => void;
  signals?: NodeJS.Signals[];
}

/**
 * Replaces Nest's enableShutdownHooks(). Nest's own app.close() runs onModuleDestroy (Prisma
 * disconnect, outbox timer) *before* it closes the HTTP server, and its adapter destroys open
 * sockets, so in-flight requests would be cut off. Order here:
 * fail readiness -> wait drainDelayMs -> stop accepting connections -> wait for in-flight
 * requests -> app.close() (WebSockets, module hooks, AMQP) -> exit.
 */
export function registerGracefulShutdown(
  app: INestApplication,
  options: GracefulShutdownOptions,
): void {
  const server = app.getHttpServer() as Server;
  let inFlight = 0;
  server.on('request', (_req, res) => {
    inFlight += 1;
    res.once('close', () => (inFlight -= 1));
  });

  let started = false;
  const onSignal = (signal: NodeJS.Signals) => {
    if (started) return;
    started = true;
    void shutdown(signal);
  };
  for (const signal of options.signals ?? ['SIGTERM', 'SIGINT']) {
    process.once(signal, onSignal);
  }

  async function shutdown(signal: NodeJS.Signals): Promise<void> {
    const { logger, drainDelayMs, timeoutMs } = options;
    const exit = options.exit ?? ((code: number) => process.exit(code));
    let timedOut = false;
    const deadline = setTimeout(() => {
      timedOut = true;
      logger.error(
        `Shutdown did not finish within ${timeoutMs}ms (${inFlight} requests still in flight), exiting`,
        undefined,
        CONTEXT,
      );
      exit(1);
    }, timeoutMs);
    deadline.unref();

    try {
      logger.info(
        `${signal} received: failing readiness, draining for ${drainDelayMs}ms`,
        CONTEXT,
      );
      options.onShutdownStart();
      await sleep(drainDelayMs);

      // Stop accepting new connections; requests already running keep going
      server.close();
      while (inFlight > 0 && !timedOut) await sleep(IN_FLIGHT_POLL_MS);
      if (timedOut) return;

      await app.close();
      clearTimeout(deadline);
      logger.info('Shutdown complete', CONTEXT);
      exit(0);
    } catch (err) {
      clearTimeout(deadline);
      logger.error('Shutdown failed', describeError(err), CONTEXT);
      exit(1);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

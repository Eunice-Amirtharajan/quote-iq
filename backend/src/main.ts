import './tracing'; // must be first — registers OTel SDK before any instrumented module loads
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { TokenStoreService } from './common/token-store/token-store.service';
import { AppLogger } from './common/logger/logger.service';
import { registerGracefulShutdown } from './common/lifecycle/graceful-shutdown';
import { HealthService } from './modules/health/health.service';
import cookieParser from 'cookie-parser';
import { corsOptions } from './common/cors/cors-options';
import helmet from 'helmet';

const KEEPALIVE_INTERVAL_MS = 4 * 60 * 1000; // 4 minutes — Neon pauses at 5 min idle
// Production: give the load balancer time to see readiness fail before the server closes
const SHUTDOWN_DRAIN_DELAY_MS = Number(
  process.env.SHUTDOWN_DRAIN_DELAY_MS ??
    (process.env.NODE_ENV === 'production' ? 5_000 : 0),
);
const SHUTDOWN_TIMEOUT_MS = 25_000; // below the 30s k8s/Railway grace period before SIGKILL

function startDbKeepalive(prisma: PrismaService) {
  setInterval(() => {
    void prisma.$queryRaw`SELECT 1`.catch((err: unknown) => {
      console.warn(
        `[PrismaService] Keepalive ping failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }, KEEPALIVE_INTERVAL_MS).unref();
}

function assertEnvVariables(key: string) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}
async function bootstrap() {
  assertEnvVariables('JWT_SECRET');
  assertEnvVariables('GROQ_API_KEY');
  assertEnvVariables('OPENAI_API_KEY');
  assertEnvVariables('DATABASE_URL');
  assertEnvVariables('RABBITMQ_URL');
  assertEnvVariables('SUPABASE_URL');
  assertEnvVariables('SUPABASE_SERVICE_ROLE_KEY');
  assertEnvVariables('PORT');
  assertEnvVariables('NODE_ENV');
  assertEnvVariables('JWT_EXPIRES_IN');
  assertEnvVariables('CORS_ORIGIN');

  const app = await NestFactory.create(AppModule);
  app.use(
    helmet({
      // GraphQL playground uses inline scripts — relax CSP in non-production only
      contentSecurityPolicy:
        process.env.NODE_ENV === 'production' ? undefined : false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(cookieParser());
  app.enableCors(corsOptions(process.env.CORS_ORIGIN));

  // Liveness check — registered before listen() so it answers as soon as the port is open.
  // No DB call — never fails due to Neon cold start. Readiness is GET /health/ready (HealthModule).
  app
    .getHttpAdapter()
    .get(
      '/health',
      (
        _req: unknown,
        res: { status: (c: number) => { json: (b: unknown) => void } },
      ) => {
        res.status(200).json({ status: 'ok' });
      },
    );

  // Test-only token endpoint — allows E2E tests to retrieve a freshly minted
  // invite or reset token without reading the email. Never registered in production.
  if (process.env.NODE_ENV !== 'production') {
    const tokenStore = app.get(TokenStoreService);
    app.getHttpAdapter().get(
      '/__test__/token/:key',
      async (
        req: { params: { key: string } },
        res: {
          status: (c: number) => {
            json: (b: unknown) => void;
            send: (b: string) => void;
          };
          json: (b: unknown) => void;
        },
      ) => {
        const value = await tokenStore.get(req.params.key);
        if (!value) {
          res.status(404).json({ error: 'not found' });
        } else {
          res.json({ value });
        }
      },
    );
  }

  await app.listen(process.env.PORT ?? 4000);
  const health = app.get(HealthService);
  registerGracefulShutdown(app, {
    drainDelayMs: SHUTDOWN_DRAIN_DELAY_MS,
    timeoutMs: SHUTDOWN_TIMEOUT_MS,
    logger: app.get(AppLogger),
    onShutdownStart: () => health.markShuttingDown(),
  });
  const prisma = app.get(PrismaService);
  startDbKeepalive(prisma);
}
bootstrap().catch((err: unknown) => {
  console.error('Bootstrap failed', err);
  process.exit(1);
});

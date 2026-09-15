import './tracing'; // must be first — registers OTel SDK before any instrumented module loads
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

const KEEPALIVE_INTERVAL_MS = 4 * 60 * 1000; // 4 minutes — Neon pauses at 5 min idle

function startDbKeepalive(prisma: PrismaService) {
  setInterval(() => {
    void prisma.$queryRaw`SELECT 1`.catch((err: unknown) => {
      console.warn(
        `[PrismaService] Keepalive ping failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }, KEEPALIVE_INTERVAL_MS);
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
  assertEnvVariables('DATABASE_URL');
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
  const allowedOrigins = new Set(
    (process.env.CORS_ORIGIN ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  );
  app.enableCors({
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
    ],
  });

  // Health check — registered before listen() so Railway probes it immediately on deploy.
  // No DB call — never fails due to Neon cold start.
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

  await app.listen(process.env.PORT ?? 4000);
  const prisma = app.get(PrismaService);
  startDbKeepalive(prisma);
}
bootstrap().catch((err: unknown) => {
  console.error('Bootstrap failed', err);
  process.exit(1);
});

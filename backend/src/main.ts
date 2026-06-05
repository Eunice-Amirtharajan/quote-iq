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
  const allowedOrigins = (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Apollo-Require-Preflight',
    ],
  });
  await app.listen(process.env.PORT ?? 4000);
  const prisma = app.get(PrismaService);
  startDbKeepalive(prisma);
}
void bootstrap();

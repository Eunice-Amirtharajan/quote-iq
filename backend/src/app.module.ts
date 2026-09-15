import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { GqlThrottlerGuard } from './common/guards/gql-throttler.guard';
import { join } from 'node:path';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { Request, Response } from 'express';
import { QuotationsModule } from './modules/quotations/quotations.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { LoggerModule } from './common/logger/logger.module';
import { AIModule } from './modules/ai/ai.module';
import { MailModule } from './common/mail/mail.module';
import { EventsModule } from './modules/events/events.module';
import { QueueConsumerModule } from './modules/queue-consumer/queue-consumer.module';
import { GatewayModule } from './modules/gateway/gateway.module';
import { CorrelationIdMiddleware } from './common/correlation/correlation-id.middleware';
import { MetricsModule } from './common/metrics/metrics.module';
import { DocumentsModule } from './modules/documents/documents.module';

@Module({
  imports: [
    LoggerModule,
    ThrottlerModule.forRoot([
      {
        name: 'global',
        ttl: 60_000,
        limit: 120,
      },
    ]),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile:
        process.env.NODE_ENV === 'production'
          ? join('/tmp', 'schema.gql')
          : join(process.cwd(), 'src/schema.gql'),
      sortSchema: true,
      introspection: process.env.NODE_ENV !== 'production',
      playground: process.env.NODE_ENV !== 'production',
      csrfPrevention: true,
      formatError: (err: import('graphql').GraphQLFormattedError) => {
        const msg = err.message ?? '';
        const isDbDown =
          msg.includes("Can't reach database") ||
          msg.includes('connect ECONNREFUSED') ||
          msg.includes('Connection refused') ||
          msg.includes('prisma');
        if (isDbDown) {
          return {
            ...err,
            message:
              'Service temporarily unavailable. Please try again in a moment.',
          };
        }
        return err;
      },
      context: ({ req, res }: { req: Request; res: Response }) => ({
        req,
        res,
      }),
    }),
    PrismaModule,
    AuthModule,
    QuotationsModule,
    DashboardModule,
    AIModule,
    MailModule,
    EventsModule,
    QueueConsumerModule,
    GatewayModule,
    MetricsModule,
    DocumentsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: GqlThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}

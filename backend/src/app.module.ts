import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { join } from 'node:path';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { Request, Response } from 'express';
import { QuotationsModule } from './modules/quotations/quotations.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { LoggerModule } from './common/logger/logger.module';
import { AIModule } from './modules/ai/ai.module';

@Module({
  imports: [
    LoggerModule,
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
      sortSchema: true,
      introspection: process.env.NODE_ENV !== 'production',
      playground: process.env.NODE_ENV !== 'production',
      csrfPrevention: true,
      formatError: (err) => {
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
  ],
})
export class AppModule {}

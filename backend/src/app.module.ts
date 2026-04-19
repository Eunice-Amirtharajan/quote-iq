import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { join } from 'path';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { Request, Response } from 'express';
import { ClientsModule } from './modules/clients/clients.module';
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
      introspection: true,
      playground: false,
      csrfPrevention: false,
      context: ({ req, res }: { req: Request; res: Response }) => ({
        req,
        res,
      }),
    }),
    PrismaModule,
    AuthModule,
    ClientsModule,
    QuotationsModule,
    DashboardModule,
    AIModule,
  ],
})
export class AppModule {}

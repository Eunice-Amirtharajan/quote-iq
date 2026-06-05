import { Resolver, Mutation, Args, Query, Context } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Response } from 'express';
import { UserType } from '../users/user.entity';
import type { User as PrismaUser } from '@prisma/client';

@Resolver()
export class AuthResolver {
  constructor(private readonly authService: AuthService) {}

  // password is a plain GraphQL arg — API gateways and tracing tools may log
  // GraphQL variables. Ensure GEMINI/Apollo Studio variable logging is disabled
  // in production, or migrate login to a dedicated REST endpoint.
  @Mutation(() => UserType)
  async login(
    @Args('email') email: string,
    @Args('password') password: string,
    @Context() context: { res: Response },
  ): Promise<PrismaUser> {
    return this.authService.login(email, password, context.res);
  }

  @Mutation(() => Boolean)
  @UseGuards(JwtAuthGuard)
  logout(@Context() context: { res: Response }): boolean {
    return this.authService.logout(context.res);
  }

  @Query(() => UserType)
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: UserType): UserType {
    return user;
  }
}

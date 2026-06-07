import { Resolver, Mutation, Args, Query, Context } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Response } from 'express';
import { UserType, SalesRepSummaryType } from '../users/user.entity';
import { Role } from '@prisma/client';
import type { User as PrismaUser } from '@prisma/client';

@Resolver()
export class AuthResolver {
  constructor(private readonly authService: AuthService) {}

  // password is a plain GraphQL arg — API gateways and tracing tools may log
  // GraphQL variables. Ensure GEMINI/Apollo Studio variable logging is disabled
  // in production, or migrate login to a dedicated REST endpoint.
  @Mutation(/* istanbul ignore next */ () => UserType)
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

  @Query(/* istanbul ignore next */ () => UserType)
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: UserType): UserType {
    return user;
  }

  @Query(/* istanbul ignore next */ () => [SalesRepSummaryType])
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SALES_MANAGER, Role.ADMIN)
  salesReps(): Promise<Pick<PrismaUser, 'id' | 'name'>[]> {
    return this.authService.salesReps();
  }
}

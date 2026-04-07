import { Resolver, Mutation, Args, Query, Context } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

import { Response } from 'express';
import { User } from '../users/user.entity';

@Resolver()
export class AuthResolver {
  constructor(private readonly authService: AuthService) {}

  @Mutation(() => User)
  async login(
    @Args('email') email: string,
    @Args('password') password: string,
    @Context() context: { res: Response },
  ) {
    return this.authService.login(email, password, context.res);
  }

  @Mutation(() => Boolean)
  @UseGuards(JwtAuthGuard)
  logout(@Context() context: { res: Response }) {
    return this.authService.logout(context.res);
  }

  @Query(() => User)
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: User) {
    return user;
  }
}

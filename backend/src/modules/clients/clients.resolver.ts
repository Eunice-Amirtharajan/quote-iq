import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { Client } from './client.entity';
import { ClientInput } from './dto/client.input';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { User } from '@prisma/client';

@Resolver(() => Client)
@UseGuards(JwtAuthGuard)
export class ClientsResolver {
  constructor(private readonly clientsService: ClientsService) {}

  @Query(() => [Client])
  async clients(@CurrentUser() user: User) {
    return this.clientsService.findAll(user.id, user.role);
  }

  @Query(() => Client, { nullable: true })
  async client(@Args('id', { type: () => ID }) id: string) {
    return this.clientsService.findOne(id);
  }

  @Mutation(() => Client)
  async createClient(
    @Args('input') input: ClientInput,
    @CurrentUser() user: User,
  ) {
    return this.clientsService.create(input, user.id);
  }

  @Mutation(() => Client)
  async updateClient(
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: ClientInput,
  ) {
    return this.clientsService.update(id, input);
  }

  @Mutation(() => Boolean)
  async deleteClient(@Args('id', { type: () => ID }) id: string) {
    return this.clientsService.delete(id);
  }
}

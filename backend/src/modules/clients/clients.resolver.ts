import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { ClientType } from './client.entity';
import { ClientInput } from './dto/client.input';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserType } from '../users/user.entity';
import { Role } from '@prisma/client';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Resolver(() => ClientType)
@UseGuards(JwtAuthGuard)
export class ClientsResolver {
  constructor(private readonly clientsService: ClientsService) {}

  @Query(() => [ClientType])
  async clients(@CurrentUser() user: UserType): Promise<ClientType[]> {
    return this.clientsService.findAll(user);
  }

  @Query(() => ClientType, { nullable: true })
  async client(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<ClientType | null> {
    return this.clientsService.findOne(id);
  }

  @Mutation(() => ClientType)
  async createClient(
    @Args('input') input: ClientInput,
    @CurrentUser() user: UserType,
  ): Promise<ClientType> {
    return this.clientsService.create(input, user);
  }

  @Mutation(() => ClientType)
  async updateClient(
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: ClientInput,
  ): Promise<ClientType> {
    return this.clientsService.update(id, input);
  }

  @Mutation(() => Boolean)
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SALES_MANAGER)
  async deleteClient(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    return this.clientsService.delete(id);
  }
}

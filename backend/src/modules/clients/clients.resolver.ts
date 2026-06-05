import { Resolver, Query, Mutation, Args, ID, Int } from '@nestjs/graphql';
import {
  ForbiddenException,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
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

  @Query(/* istanbul ignore next */ () => [ClientType])
  async clients(
    @CurrentUser() user: UserType,
    @Args('take', {
      nullable: true,
      type: /* istanbul ignore next */ () => Int,
    })
    take?: number,
    @Args('skip', {
      nullable: true,
      type: /* istanbul ignore next */ () => Int,
    })
    skip?: number,
  ): Promise<ClientType[]> {
    return this.clientsService.findAll(user, take, skip);
  }

  @Query(/* istanbul ignore next */ () => ClientType, { nullable: true })
  async client(
    @Args('id', { type: /* istanbul ignore next */ () => ID }) id: string,
    @CurrentUser() user: UserType,
  ): Promise<ClientType | null> {
    if (user.role === Role.SALES_REP) {
      const owner = await this.clientsService.findOwner(id);
      if (!owner) return null;
      if (owner.createdById !== user.id) {
        throw new ForbiddenException();
      }
    }

    const client = await this.clientsService.findOne(id);
    if (!client) {
      return null;
    }
    return client;
  }

  @Mutation(/* istanbul ignore next */ () => ClientType)
  async createClient(
    @Args('input') input: ClientInput,
    @CurrentUser() user: UserType,
  ): Promise<ClientType> {
    return this.clientsService.create(input, user);
  }

  @Mutation(/* istanbul ignore next */ () => ClientType)
  async updateClient(
    @Args('id', { type: /* istanbul ignore next */ () => ID }) id: string,
    @Args('input') input: ClientInput,
    @CurrentUser() user: UserType,
  ): Promise<ClientType> {
    const owner = await this.clientsService.findOwner(id);
    if (!owner) throw new NotFoundException(`Client ${id} not found`);
    if (user.role === Role.SALES_REP && owner.createdById !== user.id) {
      throw new ForbiddenException();
    }
    return this.clientsService.update(id, input);
  }

  @Mutation(/* istanbul ignore next */ () => Boolean)
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.SALES_MANAGER)
  async deleteClient(
    @Args('id', { type: /* istanbul ignore next */ () => ID }) id: string,
  ): Promise<boolean> {
    return this.clientsService.delete(id);
  }
}

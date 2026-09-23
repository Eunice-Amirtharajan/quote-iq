import { Resolver, Query, Mutation, Args, ID, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { ClientType, ClientsPageType } from './client.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Resolver(/* istanbul ignore next */ () => ClientType)
@UseGuards(JwtAuthGuard)
export class ClientsResolver {
  constructor(private readonly clientsService: ClientsService) {}

  /** Flat list used by ClientSelector — capped at 50, supports search. */
  @Query(/* istanbul ignore next */ () => [ClientType])
  async clients(
    @Args('search', { nullable: true }) search?: string,
  ): Promise<ClientType[]> {
    return this.clientsService.findAll(search, 0, 50);
  }

  /** Paginated list for the Clients management page. */
  @Query(/* istanbul ignore next */ () => ClientsPageType)
  async clientsPage(
    @Args('search', { nullable: true }) search?: string,
    @Args('skip', { type: /* istanbul ignore next */ () => Int, nullable: true }) skip?: number,
    @Args('take', { type: /* istanbul ignore next */ () => Int, nullable: true }) take?: number,
  ): Promise<ClientsPageType> {
    const [items, total] = await Promise.all([
      this.clientsService.findAll(search, skip ?? 0, take ?? 50),
      this.clientsService.countAll(search),
    ]);
    return { items, total };
  }

  @Query(/* istanbul ignore next */ () => ClientType, { nullable: true })
  async client(
    @Args('id', { type: /* istanbul ignore next */ () => ID }) id: string,
  ): Promise<ClientType> {
    return this.clientsService.findOne(id);
  }

  @Mutation(/* istanbul ignore next */ () => ClientType)
  @UseGuards(RolesGuard)
  @Roles(Role.SALES_MANAGER)
  async createClient(
    @Args('name') name: string,
    @Args('email', { nullable: true }) email?: string,
  ): Promise<ClientType> {
    return this.clientsService.findOrCreate(name, email);
  }

  @Mutation(/* istanbul ignore next */ () => Boolean)
  @UseGuards(RolesGuard)
  @Roles(Role.SALES_MANAGER)
  async deleteClient(
    @Args('id', { type: /* istanbul ignore next */ () => ID }) id: string,
  ): Promise<boolean> {
    return this.clientsService.delete(id);
  }
}

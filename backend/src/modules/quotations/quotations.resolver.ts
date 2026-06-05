import { Resolver, Query, Mutation, Args, ID, Int } from '@nestjs/graphql';
import {
  ForbiddenException,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { QuotationsService } from './quotations.service';
import { QuotationType } from './quotation.entity';
import {
  CreateQuotationInput,
  UpdateQuotationStatusInput,
} from './dto/quotation.input';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserType } from '../users/user.entity';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { ClientsService } from '../clients/clients.service';

@Resolver(() => QuotationType)
@UseGuards(JwtAuthGuard)
export class QuotationsResolver {
  constructor(
    private readonly quotationsService: QuotationsService,
    private readonly clientsService: ClientsService,
  ) {}

  @Query(() => [QuotationType])
  async quotations(
    @CurrentUser() user: UserType,
    @Args('take', { nullable: true, type: () => Int }) take?: number,
    @Args('skip', { nullable: true, type: () => Int }) skip?: number,
  ): Promise<QuotationType[]> {
    return this.quotationsService.findAll(user, take, skip);
  }

  @Query(() => QuotationType, { nullable: true })
  async quotation(
    @Args('id', { type: () => ID }) id: string,
    @CurrentUser() user: UserType,
  ): Promise<QuotationType | null> {
    if (user.role === Role.SALES_REP) {
      const owner = await this.quotationsService.findOwner(id);
      if (!owner) return null;
      if (user.id !== owner.createdById) throw new ForbiddenException();
    }
    return this.quotationsService.findOne(id);
  }

  @Mutation(() => QuotationType)
  async createQuotation(
    @Args('input') input: CreateQuotationInput,
    @CurrentUser() user: UserType,
  ): Promise<QuotationType> {
    const clientOwner = await this.clientsService.findOwner(input.clientId);
    if (!clientOwner)
      throw new NotFoundException(`Client ${input.clientId} not found`);
    // SALES_REP may only quote against clients they own; managers can quote any client
    if (
      user.role !== Role.ADMIN &&
      user.role !== Role.SALES_MANAGER &&
      user.id !== clientOwner.createdById
    )
      throw new ForbiddenException();
    return this.quotationsService.create(input, user);
  }

  @Mutation(() => QuotationType)
  async updateQuotationStatus(
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateQuotationStatusInput,
    @CurrentUser() user: UserType,
  ): Promise<QuotationType> {
    if (user.role === Role.SALES_REP) {
      const owner = await this.quotationsService.findOwner(id);
      if (!owner) throw new NotFoundException(`Quotation ${id} not found`);
      if (user.id !== owner.createdById) throw new ForbiddenException();
    }
    return this.quotationsService.updateStatus(
      id,
      input.status,
      input.note,
      user.id,
      user.role,
    );
  }

  @Mutation(() => Boolean)
  @UseGuards(RolesGuard)
  @Roles(Role.SALES_MANAGER, Role.ADMIN)
  async deleteQuotation(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    return this.quotationsService.delete(id);
  }
}

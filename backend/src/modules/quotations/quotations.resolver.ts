import { Resolver, Query, Mutation, Args, ID, Int } from '@nestjs/graphql';
import {
  NotFoundException,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import { QuotationsService } from './quotations.service';
import { QuotationType } from './quotation.entity';
import { StatusHistoryType } from './status-history.entity';
import {
  CreateQuotationInput,
  QuotationFilterInput,
  UpdateQuotationInput,
  UpdateQuotationStatusInput,
} from './dto/quotation.input';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserType } from '../users/user.entity';
import { Role } from '@prisma/client';

@Resolver(() => QuotationType)
@UseGuards(JwtAuthGuard)
export class QuotationsResolver {
  constructor(private readonly quotationsService: QuotationsService) {}

  @Query(/* istanbul ignore next */ () => [QuotationType])
  async quotations(
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
    @Args('filter', {
      nullable: true,
      type: /* istanbul ignore next */ () => QuotationFilterInput,
    })
    filter?: QuotationFilterInput,
  ): Promise<QuotationType[]> {
    return this.quotationsService.findAll(user, take, skip, filter);
  }

  @Query(/* istanbul ignore next */ () => QuotationType, { nullable: true })
  async quotation(
    @Args('id', { type: /* istanbul ignore next */ () => ID }) id: string,
    @CurrentUser() user: UserType,
  ): Promise<QuotationType | null> {
    if (user.role === Role.SALES_REP) {
      const owner = await this.quotationsService.findOwner(id);
      if (!owner) return null;
      if (user.id !== owner.createdById) throw new ForbiddenException();
    }
    return this.quotationsService.findOne(id);
  }

  @Mutation(/* istanbul ignore next */ () => QuotationType)
  async createQuotation(
    @Args('input') input: CreateQuotationInput,
    @CurrentUser() user: UserType,
  ): Promise<QuotationType> {
    return this.quotationsService.create(input, user);
  }

  @Mutation(/* istanbul ignore next */ () => QuotationType)
  async updateQuotation(
    @Args('id', { type: /* istanbul ignore next */ () => ID }) id: string,
    @Args('input') input: UpdateQuotationInput,
    @CurrentUser() user: UserType,
  ): Promise<QuotationType> {
    return this.quotationsService.update(id, input, user.id);
  }

  @Mutation(/* istanbul ignore next */ () => QuotationType)
  async updateQuotationStatus(
    @Args('id', { type: /* istanbul ignore next */ () => ID }) id: string,
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

  @Mutation(/* istanbul ignore next */ () => Boolean)
  async deleteQuotation(
    @Args('id', { type: /* istanbul ignore next */ () => ID }) id: string,
    @CurrentUser() user: UserType,
  ): Promise<boolean> {
    return this.quotationsService.delete(id, user.id);
  }

  @Query(/* istanbul ignore next */ () => [StatusHistoryType])
  async statusHistory(
    @Args('quotationId', { type: /* istanbul ignore next */ () => ID })
    quotationId: string,
    @CurrentUser() user: UserType,
  ): Promise<StatusHistoryType[]> {
    return this.quotationsService.findStatusHistory(
      quotationId,
      user.id,
      user.role,
    );
  }
}

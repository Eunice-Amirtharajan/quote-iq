import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { QuotationsService } from './quotations.service';
import { QuotationType } from './quotation.entity';
import {
  CreateQuotationInput,
  UpdateQuotationStatusInput,
} from './dto/quotation.input';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { User } from '@prisma/client';
import { UserType } from '../users/user.entity';

@Resolver(() => QuotationType)
@UseGuards(JwtAuthGuard)
export class QuotationsResolver {
  constructor(private readonly quotationsService: QuotationsService) {}

  @Query(() => [QuotationType])
  async quotations(@CurrentUser() user: User) {
    return this.quotationsService.findAll(user);
  }

  @Query(() => QuotationType, { nullable: true })
  async quotation(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<QuotationType | null> {
    return this.quotationsService.findOne(id);
  }

  @Mutation(() => QuotationType)
  async createQuotation(
    @Args('input') input: CreateQuotationInput,
    @CurrentUser() user: UserType,
  ): Promise<QuotationType> {
    return this.quotationsService.create(input, user);
  }

  @Mutation(() => QuotationType)
  async updateQuotationStatus(
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateQuotationStatusInput,
    @CurrentUser() user: UserType,
  ): Promise<QuotationType> {
    return this.quotationsService.updateStatus(
      id,
      input.status,
      input.note,
      user.id,
    );
  }

  @Mutation(() => Boolean)
  async deleteQuotation(@Args('id', { type: () => ID }) id: string) {
    return this.quotationsService.delete(id);
  }
}

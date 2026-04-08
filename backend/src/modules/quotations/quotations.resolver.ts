import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { QuotationsService } from './quotations.service';
import { Quotation } from './quotation.entity';
import {
  CreateQuotationInput,
  UpdateQuotationStatusInput,
} from './dto/quotation.input';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { User } from '@prisma/client';

@Resolver(() => Quotation)
@UseGuards(JwtAuthGuard)
export class QuotationsResolver {
  constructor(private readonly quotationsService: QuotationsService) {}

  @Query(() => [Quotation])
  async quotations(@CurrentUser() user: User) {
    return this.quotationsService.findAll(user.id, user.role);
  }

  @Query(() => Quotation, { nullable: true })
  async quotation(@Args('id', { type: () => ID }) id: string) {
    return this.quotationsService.findOne(id);
  }

  @Mutation(() => Quotation)
  async createQuotation(
    @Args('input') input: CreateQuotationInput,
    @CurrentUser() user: User,
  ) {
    return this.quotationsService.create(input, user.id);
  }

  @Mutation(() => Quotation)
  async updateQuotationStatus(
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateQuotationStatusInput,
    @CurrentUser() user: User,
  ) {
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

import { Resolver, Query, Args, ID } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { AIService } from './ai.service';
import { QuotationSummaryType } from './ai-insight.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Resolver()
@UseGuards(JwtAuthGuard)
export class AIResolver {
  constructor(private readonly aiService: AIService) {}

  @Query(() => QuotationSummaryType, {
    description: 'Generate AI summary for a quotation',
  })
  @UseGuards(RolesGuard)
  @Roles(Role.SALES_MANAGER, Role.ADMIN)
  async quotationSummary(
    @Args('quotationId', { type: () => ID }) quotationId: string,
  ): Promise<QuotationSummaryType> {
    return this.aiService.generateQuotationSummary(quotationId);
  }
}

import { Resolver, Mutation, Query, Args, ID } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { AIService } from './ai.service';
import {
  ConversionScoreType,
  QuotationSummaryType,
  WinLossStatsType,
} from './ai-insight.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Resolver()
@UseGuards(JwtAuthGuard)
export class AIResolver {
  constructor(private readonly aiService: AIService) {}

  @Mutation(/* istanbul ignore next */ () => QuotationSummaryType, {
    description: 'Generate or refresh the AI summary for a quotation',
  })
  @UseGuards(RolesGuard)
  @Roles(Role.SALES_MANAGER, Role.ADMIN)
  async quotationSummary(
    @Args('quotationId', { type: /* istanbul ignore next */ () => ID })
    quotationId: string,
  ): Promise<QuotationSummaryType> {
    return this.aiService.generateQuotationSummary(quotationId);
  }

  @Query(/* istanbul ignore next */ () => ConversionScoreType, {
    description: 'Deterministic conversion likelihood score for a quotation',
  })
  @UseGuards(RolesGuard)
  @Roles(Role.SALES_MANAGER, Role.ADMIN)
  async conversionScore(
    @Args('quotationId', { type: /* istanbul ignore next */ () => ID })
    quotationId: string,
  ): Promise<ConversionScoreType> {
    return this.aiService.getConversionScore(quotationId);
  }

  @Query(/* istanbul ignore next */ () => WinLossStatsType, {
    description: 'Aggregated win/loss analysis across all quotations',
  })
  @UseGuards(RolesGuard)
  @Roles(Role.SALES_MANAGER, Role.ADMIN)
  async winLossAnalysis(): Promise<WinLossStatsType> {
    return this.aiService.getWinLossAnalysis();
  }
}

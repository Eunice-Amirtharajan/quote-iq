import { Resolver, Mutation, Query, Args, ID } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { AIService } from './ai.service';
import {
  ConversionScoreType,
  QuotationAnswerType,
  QuotationSummaryType,
  WinLossStatsType,
  LessonsLearnedAnswerType,
  PlaybookAnswerType,
  SimilarQuotationType,
} from './ai-insight.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserType } from '../users/user.entity';
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
  @Roles(Role.SALES_MANAGER)
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
  @Roles(Role.SALES_MANAGER)
  async conversionScore(
    @Args('quotationId', { type: /* istanbul ignore next */ () => ID })
    quotationId: string,
  ): Promise<ConversionScoreType> {
    return await this.aiService.getConversionScore(quotationId);
  }

  @Query(/* istanbul ignore next */ () => [ConversionScoreType])
  @UseGuards(RolesGuard)
  @Roles(Role.SALES_MANAGER)
  async conversionScores(
    @Args('quotationIds', { type: /* istanbul ignore next */ () => [ID] })
    quotationIds: string[],
  ): Promise<ConversionScoreType[]> {
    return this.aiService.getConversionScores(quotationIds);
  }

  @Query(/* istanbul ignore next */ () => WinLossStatsType, {
    description: 'Aggregated win/loss analysis across all quotations',
  })
  @UseGuards(RolesGuard)
  @Roles(Role.SALES_MANAGER)
  async winLossAnalysis(): Promise<WinLossStatsType> {
    return this.aiService.getWinLossAnalysis();
  }

  @Mutation(/* istanbul ignore next */ () => QuotationAnswerType, {
    description: 'Answer a free-text question about a specific quotation',
  })
  @UseGuards(RolesGuard)
  @Roles(Role.SALES_MANAGER)
  async askAboutQuotation(
    @Args('quotationId', { type: /* istanbul ignore next */ () => ID })
    quotationId: string,
    @Args('question', { type: /* istanbul ignore next */ () => String })
    question: string,
  ): Promise<QuotationAnswerType> {
    return this.aiService.askAboutQuotation(quotationId, question);
  }

  @Query(/* istanbul ignore next */ () => LessonsLearnedAnswerType)
  @UseGuards(RolesGuard)
  @Roles(Role.SALES_MANAGER)
  async askLessonsLearned(
    @Args('question') question: string,
  ): Promise<LessonsLearnedAnswerType> {
    return this.aiService.askLessonsLearned(question);
  }

  @Mutation(/* istanbul ignore next */ () => PlaybookAnswerType, {
    description:
      'Answer a free-text question using READY sales-playbook documents (available to Sales Reps and Managers)',
  })
  @UseGuards(RolesGuard)
  @Roles(Role.SALES_REP, Role.SALES_MANAGER)
  async askPlaybook(
    @Args('question', { type: /* istanbul ignore next */ () => String })
    question: string,
  ): Promise<PlaybookAnswerType> {
    return this.aiService.askPlaybook(question);
  }

  @Query(/* istanbul ignore next */ () => [SimilarQuotationType], {
    description:
      'Return similar past quotations using hybrid vector + keyword search with RRF fusion',
  })
  async similarQuotations(
    @Args('quotationId', { type: /* istanbul ignore next */ () => ID })
    quotationId: string,
    @Args('limit', {
      type: /* istanbul ignore next */ () => Number,
      nullable: true,
      defaultValue: 5,
    })
    limit: number,
    @CurrentUser() user: UserType,
  ): Promise<SimilarQuotationType[]> {
    return this.aiService.similarQuotations(
      quotationId,
      user.id,
      user.role,
      limit,
    );
  }
}

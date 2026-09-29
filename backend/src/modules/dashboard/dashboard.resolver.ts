import { Resolver, Query, Args, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { DashboardService } from './dashboard.service';
import {
  ApprovalRateMonthType,
  ClientConcentrationType,
  DashboardStatsType,
  DateRangeInput,
  DealVelocityType,
  QuarterStatsType,
  RepDealSizeWinRatesType,
  RepPerformanceType,
  StalePipelineType,
} from './dashboard.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role, type User } from '@prisma/client';

function parseRange(range?: DateRangeInput): { from?: Date; to?: Date } {
  return {
    from: range?.from ? new Date(range.from) : undefined,
    to: range?.to ? new Date(range.to) : undefined,
  };
}

@SkipThrottle()
@Resolver(() => DashboardStatsType)
@UseGuards(JwtAuthGuard)
export class DashboardResolver {
  constructor(private readonly dashboardService: DashboardService) {}

  @Query(/* istanbul ignore next */ () => DashboardStatsType)
  @UseGuards(RolesGuard)
  @Roles(Role.SALES_MANAGER)
  async dashboardStats(
    @CurrentUser() user: User,
    @Args('range', { type: () => DateRangeInput, nullable: true }) range?: DateRangeInput,
  ): Promise<DashboardStatsType> {
    const { from, to } = parseRange(range);
    return this.dashboardService.getStats(user, from, to);
  }

  @Query(/* istanbul ignore next */ () => [RepPerformanceType])
  @UseGuards(RolesGuard)
  @Roles(Role.SALES_MANAGER)
  async repPerformance(
    @Args('range', { type: () => DateRangeInput, nullable: true }) range?: DateRangeInput,
    @Args('limit', { type: /* istanbul ignore next */ () => Int, defaultValue: 10, description: 'Reps listed individually (1–20); the rest are pooled' })
    limit = 10,
  ): Promise<RepPerformanceType[]> {
    const { from, to } = parseRange(range);
    return this.dashboardService.getRepPerformance(from, to, limit);
  }

  @Query(/* istanbul ignore next */ () => [ClientConcentrationType])
  @UseGuards(RolesGuard)
  @Roles(Role.SALES_MANAGER)
  async clientConcentration(
    @Args('range', { type: () => DateRangeInput, nullable: true }) range?: DateRangeInput,
  ): Promise<ClientConcentrationType[]> {
    const { from, to } = parseRange(range);
    return this.dashboardService.getClientConcentration(from, to);
  }

  @Query(/* istanbul ignore next */ () => [ApprovalRateMonthType], {
    description: 'Last 12 calendar months — not affected by the period selector',
  })
  @UseGuards(RolesGuard)
  @Roles(Role.SALES_MANAGER)
  async approvalRateTrend(): Promise<ApprovalRateMonthType[]> {
    return this.dashboardService.getApprovalRateTrend();
  }

  @Query(/* istanbul ignore next */ () => [DealVelocityType])
  @UseGuards(RolesGuard)
  @Roles(Role.SALES_MANAGER)
  async dealVelocity(
    @Args('range', { type: () => DateRangeInput, nullable: true }) range?: DateRangeInput,
  ): Promise<DealVelocityType[]> {
    const { from, to } = parseRange(range);
    return this.dashboardService.getDealVelocity(from, to);
  }

  @Query(/* istanbul ignore next */ () => StalePipelineType, {
    description: 'Current stale SENT quotations — not affected by the period selector',
  })
  @UseGuards(RolesGuard)
  @Roles(Role.SALES_MANAGER)
  async staleQuotations(
    @Args('thresholdDays', { type: /* istanbul ignore next */ () => Int, defaultValue: 14 })
    thresholdDays: number,
  ): Promise<StalePipelineType> {
    return this.dashboardService.getStaleQuotations(thresholdDays);
  }

  @Query(/* istanbul ignore next */ () => [QuarterStatsType], {
    description: 'Last N calendar quarters including the current one — not affected by the period selector',
  })
  @UseGuards(RolesGuard)
  @Roles(Role.SALES_MANAGER)
  async quarterlyHistory(
    @Args('quarters', { type: /* istanbul ignore next */ () => Int, defaultValue: 4 })
    quarters: number,
  ): Promise<QuarterStatsType[]> {
    return this.dashboardService.getQuarterlyHistory(quarters);
  }

  @Query(/* istanbul ignore next */ () => RepDealSizeWinRatesType, {
    description: 'Win rate per rep in each deal-size band, with team averages as the baseline',
  })
  @UseGuards(RolesGuard)
  @Roles(Role.SALES_MANAGER)
  async repDealSizeWinRates(
    @Args('range', { type: () => DateRangeInput, nullable: true }) range?: DateRangeInput,
    @Args('offset', { type: /* istanbul ignore next */ () => Int, defaultValue: 0 }) offset = 0,
    @Args('limit', { type: /* istanbul ignore next */ () => Int, defaultValue: 10, description: 'Reps per page (1–50)' })
    limit = 10,
  ): Promise<RepDealSizeWinRatesType> {
    const { from, to } = parseRange(range);
    return this.dashboardService.getRepDealSizeWinRates(from, to, offset, limit);
  }
}

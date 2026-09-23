import { Resolver, Query, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { DashboardService } from './dashboard.service';
import { DashboardStatsType, DateRangeInput } from './dashboard.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role, type User } from '@prisma/client';

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
    const from = range?.from ? new Date(range.from) : undefined;
    const to = range?.to ? new Date(range.to) : undefined;
    return this.dashboardService.getStats(user, from, to);
  }
}

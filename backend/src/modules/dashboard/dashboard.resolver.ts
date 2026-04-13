import { Resolver, Query } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardStatsType } from './dashboard.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role, type User } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';

@Resolver(() => DashboardStatsType)
@UseGuards(JwtAuthGuard)
@Roles(Role.SALES_MANAGER, Role.ADMIN)
export class DashboardResolver {
  constructor(private readonly dashboardService: DashboardService) {}

  @Query(() => DashboardStatsType)
  async dashboardStats(@CurrentUser() user: User): Promise<DashboardStatsType> {
    return this.dashboardService.getStats(user);
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardStatsType, TrendIndicator } from './dashboard.entity';
import { QuotationStatus, Role, User } from '@prisma/client';
import { AppLogger } from '../../common/logger/logger.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {}

  private buildDateFilter(from?: Date, to?: Date) {
    if (!from && !to) return undefined;
    return {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };
  }

  private calcConversionRate(approved: number, rejected: number): number {
    return approved + rejected > 0
      ? Math.round((approved / (approved + rejected)) * 100 * 10) / 10
      : 0;
  }

  private calcTrend(current: number, prev: number): TrendIndicator {
    const delta = Math.round((current - prev) * 10) / 10;
    const pct =
      prev === 0
        ? current === 0
          ? 0
          : 100
        : Math.round(((current - prev) / Math.abs(prev)) * 100 * 10) / 10;
    const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
    return { delta, pct, direction };
  }

  private async fetchRawStats(
    where: Record<string, unknown>,
    dateFilter: { gte?: Date; lte?: Date } | undefined,
  ) {
    const createdAtFilter = dateFilter ? { createdAt: dateFilter } : {};
    const baseWhere = { ...where, ...createdAtFilter };

    const [
      totalQuotations,
      totalSent,
      totalApproved,
      totalRejected,
      pipelineAgg,
      approvedAgg,
    ] = await Promise.all([
      this.prisma.quotation.count({ where: baseWhere }),
      this.prisma.quotation.count({
        where: { ...baseWhere, status: QuotationStatus.SENT },
      }),
      this.prisma.quotation.count({
        where: { ...baseWhere, status: QuotationStatus.APPROVED },
      }),
      this.prisma.quotation.count({
        where: { ...baseWhere, status: QuotationStatus.REJECTED },
      }),
      this.prisma.quotation.aggregate({
        where: { ...baseWhere, status: QuotationStatus.SENT },
        _sum: { total: true },
      }),
      this.prisma.quotation.aggregate({
        where: { ...baseWhere, status: QuotationStatus.APPROVED },
        _sum: { total: true },
      }),
    ]);

    const totalApprovedValue = approvedAgg._sum.total ?? 0;
    return {
      totalQuotations,
      totalSent,
      totalApproved,
      totalRejected,
      totalPipelineValue: pipelineAgg._sum.total ?? 0,
      totalApprovedValue,
      avgDealSize:
        totalApproved > 0
          ? Math.round((totalApprovedValue / totalApproved) * 100) / 100
          : 0,
    };
  }

  async getStats(
    user: User,
    from?: Date,
    to?: Date,
  ): Promise<DashboardStatsType> {
    this.logger.info(
      `Getting quote stats — userId: ${user.id} role: ${user.role} range: ${from && to ? `${from.toISOString()} → ${to.toISOString()}` : 'all time'}`,
      DashboardService.name,
    );
    try {
      const isManager = user.role === Role.SALES_MANAGER;
      const where = isManager ? {} : { createdById: user.id };
      const currentFilter = this.buildDateFilter(from, to);

      const current = await this.fetchRawStats(where, currentFilter);
      const conversionRate = this.calcConversionRate(
        current.totalApproved,
        current.totalRejected,
      );

      // Compute previous period only when a range is given
      let prevStats: Awaited<ReturnType<typeof this.fetchRawStats>> | null = null;
      if (from && to) {
        const spanMs = to.getTime() - from.getTime();
        const prevTo = new Date(from.getTime() - 1);
        const prevFrom = new Date(prevTo.getTime() - spanMs);
        prevStats = await this.fetchRawStats(
          where,
          this.buildDateFilter(prevFrom, prevTo),
        );
      } else if (from && !to) {
        // "from only" — previous period is same length before from
        const spanMs = Date.now() - from.getTime();
        const prevTo = new Date(from.getTime() - 1);
        const prevFrom = new Date(prevTo.getTime() - spanMs);
        prevStats = await this.fetchRawStats(
          where,
          this.buildDateFilter(prevFrom, prevTo),
        );
      }

      const prevConversionRate = prevStats
        ? this.calcConversionRate(prevStats.totalApproved, prevStats.totalRejected)
        : null;
      const prevAvgDealSize = prevStats
        ? prevStats.totalApproved > 0
          ? Math.round((prevStats.totalApprovedValue / prevStats.totalApproved) * 100) / 100
          : 0
        : null;

      this.logger.info(
        `Quote stats retrieval is successful`,
        DashboardService.name,
      );

      return {
        ...current,
        conversionRate,
        totalQuotationsTrend: prevStats
          ? this.calcTrend(current.totalQuotations, prevStats.totalQuotations)
          : null,
        conversionRateTrend:
          prevStats && prevConversionRate !== null
            ? this.calcTrend(conversionRate, prevConversionRate)
            : null,
        totalPipelineValueTrend: prevStats
          ? this.calcTrend(current.totalPipelineValue, prevStats.totalPipelineValue)
          : null,
        totalApprovedValueTrend: prevStats
          ? this.calcTrend(current.totalApprovedValue, prevStats.totalApprovedValue)
          : null,
        avgDealSizeTrend:
          prevStats && prevAvgDealSize !== null
            ? this.calcTrend(current.avgDealSize, prevAvgDealSize)
            : null,
      };
    } catch (error) {
      this.logger.error(
        `Failed while retrieving quotation stats`,
        error instanceof Error ? error.stack : String(error),
        DashboardService.name,
      );
      throw error;
    }
  }
}

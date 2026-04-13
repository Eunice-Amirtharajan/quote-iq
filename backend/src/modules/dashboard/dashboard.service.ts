import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardStatsType } from './dashboard.entity';
import { Role, User } from '@prisma/client';
import { AppLogger } from '../../common/logger/logger.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {}

  async getStats(user: User): Promise<DashboardStatsType> {
    this.logger.info(
      `Getting quote stats for: ${user.email} having role: ${user.role}`,
      DashboardService.name,
    );
    try {
      const isManager =
        user.role === Role.SALES_MANAGER || user.role === Role.ADMIN;
      const where = isManager ? {} : { createdById: user.id };
      const [
        totalQuotations,
        totalSent,
        totalApproved,
        totalRejected,
        pipelineAgg,
        approvedAgg,
      ] = await Promise.all([
        this.prisma.quotation.count({ where }),
        this.prisma.quotation.count({ where: { ...where, status: 'SENT' } }),
        this.prisma.quotation.count({
          where: { ...where, status: 'APPROVED' },
        }),
        this.prisma.quotation.count({
          where: { ...where, status: 'REJECTED' },
        }),
        this.prisma.quotation.aggregate({
          where: { ...where, status: 'SENT' },
          _sum: { total: true },
        }),
        this.prisma.quotation.aggregate({
          where: { ...where, status: 'APPROVED' },
          _sum: { total: true },
        }),
      ]);

      const conversionRate =
        totalQuotations > 0
          ? Math.round((totalApproved / totalQuotations) * 100 * 10) / 10
          : 0;
      this.logger.info(
        `Quote stats retrieval is successful`,
        DashboardService.name,
      );
      return {
        totalQuotations,
        totalSent,
        totalApproved,
        totalRejected,
        conversionRate,
        totalPipelineValue: pipelineAgg._sum.total ?? 0,
        totalApprovedValue: approvedAgg._sum.total ?? 0,
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

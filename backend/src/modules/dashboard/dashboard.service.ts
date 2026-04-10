import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardStatsType } from './dashboard.entity';
import { User } from '@prisma/client';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(user: User): Promise<DashboardStatsType> {
    const isManager = user.role === 'SALES_MANAGER' || user.role === 'ADMIN';
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
      this.prisma.quotation.count({ where: { ...where, status: 'APPROVED' } }),
      this.prisma.quotation.count({ where: { ...where, status: 'REJECTED' } }),
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

    return {
      totalQuotations,
      totalSent,
      totalApproved,
      totalRejected,
      conversionRate,
      totalPipelineValue: pipelineAgg._sum.total ?? 0,
      totalApprovedValue: approvedAgg._sum.total ?? 0,
    };
  }
}

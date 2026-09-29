import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ApprovalRateMonthType,
  ClientConcentrationType,
  DashboardStatsType,
  DealVelocityType,
  QuarterStatsType,
  RepDealSizeWinRatesType,
  RepPerformanceType,
  StalePipelineType,
  TrendIndicator,
} from './dashboard.entity';
import { Prisma, QuotationStatus, Role, User } from '@prisma/client';
import { AppLogger } from '../../common/logger/logger.service';

const TOP_REPS = 10;
const MAX_REPS = 20;
const TOP_CLIENTS = 10;
const TREND_MONTHS = 12;
const VELOCITY_TRANSITIONS = [
  'DRAFT_TO_SENT',
  'SENT_TO_APPROVED',
  'SENT_TO_REJECTED',
  'FULL_CYCLE',
] as const;
const DAY_MS = 86_400_000;
const STALE_LIMIT = 50;
const STALE_MAX_THRESHOLD_DAYS = 365;
const MAX_QUARTERS = 8;
const TOP_CLIENTS_PER_QUARTER = 2;
/** Deal-size bands (quotation total, EUR) — same labels and thresholds as AIService.byDealSize */
const DEAL_SIZE_BUCKETS = ['<5k', '5k–20k', '>20k'] as const;
const HEATMAP_REPS_PER_PAGE = 10;
const HEATMAP_MAX_REPS_PER_PAGE = 50;

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

      const [current, dealSizes] = await Promise.all([
        this.fetchRawStats(where, currentFilter),
        this.fetchDealSizeDistribution(isManager ? undefined : user.id, currentFilter),
      ]);
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
        ...dealSizes,
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

  private round2(n: number): number {
    return Math.round(n * 100) / 100;
  }

  /**
   * Median and p90 of approved deal values — the average alone hides skew from a few
   * very large deals. Prisma's aggregate API has no percentiles, so this is raw SQL.
   */
  private async fetchDealSizeDistribution(
    createdById: string | undefined,
    dateFilter: { gte?: Date; lte?: Date } | undefined,
  ): Promise<{ medianDealSize: number | null; p90DealSize: number | null }> {
    const rows = await this.prisma.$queryRaw<{ median: number | null; p90: number | null }[]>(Prisma.sql`
      SELECT
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total) AS median,
        PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY total) AS p90
      FROM "Quotation"
      WHERE status = 'APPROVED'
        ${createdById ? Prisma.sql`AND "createdById" = ${createdById}` : Prisma.empty}
        ${dateFilter?.gte ? Prisma.sql`AND "createdAt" >= ${dateFilter.gte}` : Prisma.empty}
        ${dateFilter?.lte ? Prisma.sql`AND "createdAt" <= ${dateFilter.lte}` : Prisma.empty}
    `);
    const row = rows[0];
    return {
      medianDealSize: row?.median == null ? null : this.round2(Number(row.median)),
      p90DealSize: row?.p90 == null ? null : this.round2(Number(row.p90)),
    };
  }

  private describeRange(from?: Date, to?: Date): string {
    return from || to
      ? `${from?.toISOString() ?? '…'} → ${to?.toISOString() ?? '…'}`
      : 'all time';
  }

  async getRepPerformance(
    from?: Date,
    to?: Date,
    limit = TOP_REPS,
  ): Promise<RepPerformanceType[]> {
    const top = Math.min(Math.max(limit, 1), MAX_REPS);
    this.logger.info(
      `Getting rep performance — range: ${this.describeRange(from, to)} top: ${top}`,
      DashboardService.name,
    );
    try {
      const dateFilter = this.buildDateFilter(from, to);
      // One row per (rep, status) — aggregation stays in SQL
      const rows = await this.prisma.quotation.groupBy({
        by: ['createdById', 'status'],
        where: {
          status: {
            in: [QuotationStatus.SENT, QuotationStatus.APPROVED, QuotationStatus.REJECTED],
          },
          ...(dateFilter ? { createdAt: dateFilter } : {}),
        },
        _count: { _all: true },
        _sum: { total: true },
      });

      type RepAgg = { sent: number; approved: number; rejected: number; revenue: number };
      const byRep = new Map<string, RepAgg>();
      for (const row of rows) {
        const agg = byRep.get(row.createdById) ?? { sent: 0, approved: 0, rejected: 0, revenue: 0 };
        agg.sent += row._count._all;
        if (row.status === QuotationStatus.APPROVED) {
          agg.approved += row._count._all;
          agg.revenue += row._sum.total ?? 0;
        } else if (row.status === QuotationStatus.REJECTED) {
          agg.rejected += row._count._all;
        }
        byRep.set(row.createdById, agg);
      }

      const users = await this.prisma.user.findMany({
        where: { id: { in: [...byRep.keys()] } },
        select: { id: true, name: true },
      });
      const nameById = new Map(users.map((u) => [u.id, u.name]));

      // Revenue desc, name asc as a stable tie-break
      const ranked = [...byRep.entries()]
        .map(([repId, agg]) => ({ repId, repName: nameById.get(repId) ?? 'Unknown', ...agg }))
        .sort((a, b) => b.revenue - a.revenue || a.repName.localeCompare(b.repName));

      const toRow = (
        r: RepAgg & { repId: string | null; repName: string },
        isOthers: boolean,
      ): RepPerformanceType => ({
        repId: r.repId,
        repName: r.repName,
        isOthers,
        totalSent: r.sent,
        totalApproved: r.approved,
        approvedRevenue: this.round2(r.revenue),
        winRate: this.calcConversionRate(r.approved, r.rejected),
      });

      const result = ranked.slice(0, top).map((r) => toRow(r, false));
      const rest = ranked.slice(top);
      if (rest.length > 0) {
        const others = rest.reduce(
          (acc, r) => ({
            sent: acc.sent + r.sent,
            approved: acc.approved + r.approved,
            rejected: acc.rejected + r.rejected,
            revenue: acc.revenue + r.revenue,
          }),
          { sent: 0, approved: 0, rejected: 0, revenue: 0 },
        );
        result.push(toRow({ ...others, repId: null, repName: `${rest.length} others` }, true));
      }

      this.logger.info(`Rep performance retrieval is successful`, DashboardService.name);
      return result;
    } catch (error) {
      this.logger.error(
        `Failed while retrieving rep performance`,
        error instanceof Error ? error.stack : String(error),
        DashboardService.name,
      );
      throw error;
    }
  }

  async getClientConcentration(from?: Date, to?: Date): Promise<ClientConcentrationType[]> {
    this.logger.info(
      `Getting client concentration — range: ${this.describeRange(from, to)}`,
      DashboardService.name,
    );
    try {
      const dateFilter = this.buildDateFilter(from, to);
      const where = {
        status: QuotationStatus.APPROVED,
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      };

      // Top-N ranking and the overall total both computed in SQL
      const [topRows, totalAgg] = await Promise.all([
        this.prisma.quotation.groupBy({
          by: ['clientId'],
          where,
          _count: { _all: true },
          _sum: { total: true },
          orderBy: [{ _sum: { total: 'desc' } }, { clientId: 'asc' }],
          take: TOP_CLIENTS,
        }),
        this.prisma.quotation.aggregate({ where, _sum: { total: true } }),
      ]);

      const clients = await this.prisma.client.findMany({
        where: { id: { in: topRows.map((r) => r.clientId) } },
        select: { id: true, name: true },
      });
      const nameById = new Map(clients.map((c) => [c.id, c.name]));
      const totalRevenue = totalAgg._sum.total ?? 0;

      const result = topRows.map((row) => {
        const revenue = row._sum?.total ?? 0;
        return {
          clientId: row.clientId,
          clientName: nameById.get(row.clientId) ?? 'Unknown',
          approvedRevenue: this.round2(revenue),
          shareOfTotal:
            totalRevenue > 0 ? Math.round((revenue / totalRevenue) * 1000) / 10 : 0,
          quoteCount: (row._count as { _all: number })._all,
        };
      });

      this.logger.info(`Client concentration retrieval is successful`, DashboardService.name);
      return result;
    } catch (error) {
      this.logger.error(
        `Failed while retrieving client concentration`,
        error instanceof Error ? error.stack : String(error),
        DashboardService.name,
      );
      throw error;
    }
  }

  private round1(n: number): number {
    return Math.round(n * 10) / 10;
  }

  /**
   * Always the last 12 calendar months (UTC), oldest first, including the current one.
   * Months are bucketed by when the status change happened — not by createdAt — so
   * slower rejections don't make recent months look artificially good.
   */
  async getApprovalRateTrend(now: Date = new Date()): Promise<ApprovalRateMonthType[]> {
    this.logger.info(`Getting approval rate trend`, DashboardService.name);
    try {
      const start = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (TREND_MONTHS - 1), 1),
      );

      // Prisma's groupBy cannot truncate dates, so month bucketing needs raw SQL
      const rows = await this.prisma.$queryRaw<
        { month: string; sent: bigint; approved: bigint; rejected: bigint }[]
      >(Prisma.sql`
        SELECT
          to_char(date_trunc('month', "changedAt"), 'YYYY-MM') AS month,
          COUNT(*) FILTER (WHERE "toStatus" = 'SENT')     AS sent,
          COUNT(*) FILTER (WHERE "toStatus" = 'APPROVED') AS approved,
          COUNT(*) FILTER (WHERE "toStatus" = 'REJECTED') AS rejected
        FROM "StatusHistory"
        WHERE "changedAt" >= ${start}
          AND "toStatus" IN ('SENT', 'APPROVED', 'REJECTED')
        GROUP BY 1
      `);
      const byMonth = new Map(rows.map((r) => [r.month, r]));

      // Fill every month so the sparkline renders gaps (rate: null) rather than dropping points
      const result = Array.from({ length: TREND_MONTHS }, (_, i) => {
        const month = new Date(
          Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1),
        )
          .toISOString()
          .slice(0, 7);
        const row = byMonth.get(month);
        const sent = Number(row?.sent ?? 0);
        const approved = Number(row?.approved ?? 0);
        const rejected = Number(row?.rejected ?? 0);
        return {
          month,
          sent,
          approved,
          rejected,
          rate: approved + rejected > 0 ? this.calcConversionRate(approved, rejected) : null,
        };
      });

      this.logger.info(`Approval rate trend retrieval is successful`, DashboardService.name);
      return result;
    } catch (error) {
      this.logger.error(
        `Failed while retrieving approval rate trend`,
        error instanceof Error ? error.stack : String(error),
        DashboardService.name,
      );
      throw error;
    }
  }

  /**
   * Average and p90 days per pipeline transition. The range applies to when a
   * transition completed. DRAFT→SENT and FULL_CYCLE start at Quotation.createdAt
   * (history only records DRAFT→DRAFT at creation and on edits).
   */
  async getDealVelocity(from?: Date, to?: Date): Promise<DealVelocityType[]> {
    this.logger.info(
      `Getting deal velocity — range: ${this.describeRange(from, to)}`,
      DashboardService.name,
    );
    try {
      const rows = await this.prisma.$queryRaw<
        { transition: string; avg_days: number; p90_days: number; sample_size: bigint }[]
      >(Prisma.sql`
        WITH sent AS (
          SELECT "quotationId", MIN("changedAt") AS sent_at
          FROM "StatusHistory"
          WHERE "toStatus" = 'SENT'
          GROUP BY "quotationId"
        ),
        decided AS (
          SELECT "quotationId", "toStatus"::text AS outcome, MIN("changedAt") AS decided_at
          FROM "StatusHistory"
          WHERE "toStatus" IN ('APPROVED', 'REJECTED')
          GROUP BY "quotationId", "toStatus"
        ),
        durations AS (
          SELECT 'DRAFT_TO_SENT' AS transition, s.sent_at AS ended_at,
                 EXTRACT(EPOCH FROM (s.sent_at - q."createdAt"))::float8 / 86400 AS days
          FROM sent s JOIN "Quotation" q ON q.id = s."quotationId"
          UNION ALL
          SELECT 'SENT_TO_' || d.outcome, d.decided_at,
                 EXTRACT(EPOCH FROM (d.decided_at - s.sent_at))::float8 / 86400
          FROM decided d JOIN sent s ON s."quotationId" = d."quotationId"
          UNION ALL
          SELECT 'FULL_CYCLE', d.decided_at,
                 EXTRACT(EPOCH FROM (d.decided_at - q."createdAt"))::float8 / 86400
          FROM decided d JOIN "Quotation" q ON q.id = d."quotationId"
        )
        SELECT
          transition,
          AVG(days) AS avg_days,
          PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY days) AS p90_days,
          COUNT(*) AS sample_size
        FROM durations
        WHERE TRUE
          ${from ? Prisma.sql`AND ended_at >= ${from}` : Prisma.empty}
          ${to ? Prisma.sql`AND ended_at <= ${to}` : Prisma.empty}
        GROUP BY transition
      `);
      const byTransition = new Map(rows.map((r) => [r.transition, r]));

      // Fixed order, one row per transition even when there were no samples
      const result = VELOCITY_TRANSITIONS.map((transition) => {
        const row = byTransition.get(transition);
        const sampleSize = Number(row?.sample_size ?? 0);
        return {
          transition,
          avgDays: row && sampleSize > 0 ? this.round1(Number(row.avg_days)) : null,
          p90Days: row && sampleSize > 0 ? this.round1(Number(row.p90_days)) : null,
          sampleSize,
        };
      });

      this.logger.info(`Deal velocity retrieval is successful`, DashboardService.name);
      return result;
    } catch (error) {
      this.logger.error(
        `Failed while retrieving deal velocity`,
        error instanceof Error ? error.stack : String(error),
        DashboardService.name,
      );
      throw error;
    }
  }

  /**
   * SENT quotations with no change for thresholdDays. Not range-filtered — stale is
   * always "as of now". SENT quotations can't be edited, so updatedAt is when they were sent.
   */
  async getStaleQuotations(
    thresholdDays = 14,
    now: Date = new Date(),
  ): Promise<StalePipelineType> {
    const threshold = Math.min(Math.max(thresholdDays, 1), STALE_MAX_THRESHOLD_DAYS);
    this.logger.info(
      `Getting stale quotations — threshold: ${threshold}d`,
      DashboardService.name,
    );
    try {
      const where = {
        status: QuotationStatus.SENT,
        updatedAt: { lt: new Date(now.getTime() - threshold * DAY_MS) },
      };

      // List is capped for display; count and value cover every stale quotation
      const [rows, totalCount, valueAgg] = await Promise.all([
        this.prisma.quotation.findMany({
          where,
          orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
          take: STALE_LIMIT,
          select: {
            id: true,
            quotationNumber: true,
            title: true,
            total: true,
            updatedAt: true,
            client: { select: { id: true, name: true } },
            createdBy: { select: { name: true } },
          },
        }),
        this.prisma.quotation.count({ where }),
        this.prisma.quotation.aggregate({ where, _sum: { total: true } }),
      ]);

      const result = {
        thresholdDays: threshold,
        totalCount,
        totalValue: this.round2(valueAgg._sum.total ?? 0),
        items: rows.map((q) => ({
          id: q.id,
          quotationNumber: q.quotationNumber,
          title: q.title,
          clientId: q.client.id,
          clientName: q.client.name,
          repName: q.createdBy.name,
          total: q.total,
          sentAt: q.updatedAt.toISOString(),
          daysStale: Math.floor((now.getTime() - q.updatedAt.getTime()) / DAY_MS),
        })),
      };

      this.logger.info(`Stale quotations retrieval is successful`, DashboardService.name);
      return result;
    } catch (error) {
      this.logger.error(
        `Failed while retrieving stale quotations`,
        error instanceof Error ? error.stack : String(error),
        DashboardService.name,
      );
      throw error;
    }
  }

  /**
   * The last N calendar quarters (UTC) including the one in progress, oldest first.
   * Bucketed by createdAt, matching dashboardStats. Two grouped queries instead of
   * one fetchRawStats round per quarter.
   */
  async getQuarterlyHistory(
    quarters = 4,
    now: Date = new Date(),
  ): Promise<QuarterStatsType[]> {
    const count = Math.min(Math.max(quarters, 1), MAX_QUARTERS);
    this.logger.info(
      `Getting quarterly history — quarters: ${count}`,
      DashboardService.name,
    );
    try {
      const currentQuarterMonth = Math.floor(now.getUTCMonth() / 3) * 3;
      const quarterStart = (i: number) =>
        new Date(Date.UTC(now.getUTCFullYear(), currentQuarterMonth + (i - (count - 1)) * 3, 1));
      const start = quarterStart(0);

      // Keys look like "2026-3" (year-quarter) so both queries join on the same label
      const [statRows, clientRows] = await Promise.all([
        this.prisma.$queryRaw<
          { key: string; total: bigint; approved: bigint; rejected: bigint; revenue: number; pipeline: number }[]
        >(Prisma.sql`
          SELECT
            to_char(date_trunc('quarter', "createdAt"), 'YYYY-Q') AS key,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status = 'APPROVED') AS approved,
            COUNT(*) FILTER (WHERE status = 'REJECTED') AS rejected,
            COALESCE(SUM(total) FILTER (WHERE status = 'APPROVED'), 0) AS revenue,
            COALESCE(SUM(total) FILTER (WHERE status IN ('SENT', 'APPROVED')), 0) AS pipeline
          FROM "Quotation"
          WHERE "createdAt" >= ${start}
          GROUP BY 1
        `),
        this.prisma.$queryRaw<
          { key: string; client_id: string; name: string; revenue: number }[]
        >(Prisma.sql`
          SELECT key, client_id, name, revenue
          FROM (
            SELECT
              to_char(date_trunc('quarter', q."createdAt"), 'YYYY-Q') AS key,
              c.id AS client_id,
              c.name,
              SUM(q.total) AS revenue,
              ROW_NUMBER() OVER (
                PARTITION BY to_char(date_trunc('quarter', q."createdAt"), 'YYYY-Q')
                ORDER BY SUM(q.total) DESC, c.id
              ) AS rank
            FROM "Quotation" q
            JOIN "Client" c ON c.id = q."clientId"
            WHERE q.status = 'APPROVED' AND q."createdAt" >= ${start}
            GROUP BY 1, c.id, c.name
          ) ranked
          WHERE rank <= ${TOP_CLIENTS_PER_QUARTER}
          ORDER BY key, rank
        `),
      ]);
      const statsByKey = new Map(statRows.map((r) => [r.key, r]));

      // Every quarter is returned, even empty ones, so the grid never shifts
      const result = Array.from({ length: count }, (_, i) => {
        const from = quarterStart(i);
        const to = new Date(quarterStart(i + 1).getTime() - 1);
        const q = Math.floor(from.getUTCMonth() / 3) + 1;
        const key = `${from.getUTCFullYear()}-${q}`;
        const row = statsByKey.get(key);
        const totalApproved = Number(row?.approved ?? 0);
        const approvedRevenue = Number(row?.revenue ?? 0);
        return {
          quarter: `Q${q} ${from.getUTCFullYear()}`,
          from: from.toISOString(),
          to: to.toISOString(),
          isCurrent: i === count - 1,
          totalQuotations: Number(row?.total ?? 0),
          totalApproved,
          pipelineValue: this.round2(Number(row?.pipeline ?? 0)),
          approvedRevenue: this.round2(approvedRevenue),
          winRate: this.calcConversionRate(totalApproved, Number(row?.rejected ?? 0)),
          avgDealSize: totalApproved > 0 ? this.round2(approvedRevenue / totalApproved) : 0,
          topClients: clientRows
            .filter((c) => c.key === key)
            .map((c) => ({
              clientId: c.client_id,
              name: c.name,
              revenue: this.round2(Number(c.revenue)),
            })),
        };
      });

      this.logger.info(`Quarterly history retrieval is successful`, DashboardService.name);
      return result;
    } catch (error) {
      this.logger.error(
        `Failed while retrieving quarterly history`,
        error instanceof Error ? error.stack : String(error),
        DashboardService.name,
      );
      throw error;
    }
  }

  /**
   * Win rate per rep in each deal-size band, with the team's rate per band as the
   * baseline. Answers "does this rep lose because they're weaker, or because they
   * chase bigger deals?" — which the separate by-rep and by-size views can't.
   * Bands match AIService.getWinLossAnalysis so the two views agree. Reps are ordered
   * by decided volume (most evidence first) and paginated; the team baseline always
   * covers every rep.
   */
  async getRepDealSizeWinRates(
    from?: Date,
    to?: Date,
    offset = 0,
    limit = HEATMAP_REPS_PER_PAGE,
  ): Promise<RepDealSizeWinRatesType> {
    const pageSize = Math.min(Math.max(limit, 1), HEATMAP_MAX_REPS_PER_PAGE);
    const start = Math.max(offset, 0);
    this.logger.info(
      `Getting rep × deal-size win rates — range: ${this.describeRange(from, to)} offset: ${start} limit: ${pageSize}`,
      DashboardService.name,
    );
    try {
      // One row per (rep, band) — the CASE thresholds mirror AIService's byDealSize
      const rows = await this.prisma.$queryRaw<
        { rep_id: string; bucket: string; approved: bigint; rejected: bigint }[]
      >(Prisma.sql`
        SELECT
          "createdById" AS rep_id,
          CASE
            WHEN total < 5000 THEN '<5k'
            WHEN total <= 20000 THEN '5k–20k'
            ELSE '>20k'
          END AS bucket,
          COUNT(*) FILTER (WHERE status = 'APPROVED') AS approved,
          COUNT(*) FILTER (WHERE status = 'REJECTED') AS rejected
        FROM "Quotation"
        WHERE status IN ('APPROVED', 'REJECTED')
          ${from ? Prisma.sql`AND "createdAt" >= ${from}` : Prisma.empty}
          ${to ? Prisma.sql`AND "createdAt" <= ${to}` : Prisma.empty}
        GROUP BY 1, 2
      `);

      const cell = (bucket: string, approved: number, rejected: number) => {
        const decided = approved + rejected;
        return {
          bucket,
          approved,
          rejected,
          decided,
          winRate: decided > 0 ? this.calcConversionRate(approved, rejected) : null,
        };
      };

      // Tally per rep and per band for the team baseline
      const byRep = new Map<string, Map<string, { approved: number; rejected: number }>>();
      const team = new Map<string, { approved: number; rejected: number }>(
        DEAL_SIZE_BUCKETS.map((b) => [b, { approved: 0, rejected: 0 }]),
      );
      for (const row of rows) {
        const approved = Number(row.approved);
        const rejected = Number(row.rejected);
        const bands = byRep.get(row.rep_id) ?? new Map<string, { approved: number; rejected: number }>();
        bands.set(row.bucket, { approved, rejected });
        byRep.set(row.rep_id, bands);
        const t = team.get(row.bucket);
        if (t) {
          t.approved += approved;
          t.rejected += rejected;
        }
      }

      const users = await this.prisma.user.findMany({
        where: { id: { in: [...byRep.keys()] } },
        select: { id: true, name: true },
      });
      const nameById = new Map(users.map((u) => [u.id, u.name]));

      const allReps = [...byRep.entries()]
        .map(([repId, bands]) => {
          const cells = DEAL_SIZE_BUCKETS.map((b) => {
            const counts = bands.get(b) ?? { approved: 0, rejected: 0 };
            return cell(b, counts.approved, counts.rejected);
          });
          const approved = cells.reduce((sum, c) => sum + c.approved, 0);
          const rejected = cells.reduce((sum, c) => sum + c.rejected, 0);
          return {
            repId,
            repName: nameById.get(repId) ?? 'Unknown',
            decided: approved + rejected,
            winRate: this.calcConversionRate(approved, rejected),
            cells,
          };
        })
        // Most decided deals first (the rows with the most evidence), name as a stable tie-break
        .sort((a, b) => b.decided - a.decided || a.repName.localeCompare(b.repName));

      const result = {
        buckets: [...DEAL_SIZE_BUCKETS],
        teamAverage: DEAL_SIZE_BUCKETS.map((b) => {
          const t = team.get(b)!;
          return cell(b, t.approved, t.rejected);
        }),
        reps: allReps.slice(start, start + pageSize),
        totalReps: allReps.length,
        offset: start,
        limit: pageSize,
      };

      this.logger.info(`Rep × deal-size win rates retrieval is successful`, DashboardService.name);
      return result;
    } catch (error) {
      this.logger.error(
        `Failed while retrieving rep × deal-size win rates`,
        error instanceof Error ? error.stack : String(error),
        DashboardService.name,
      );
      throw error;
    }
  }
}

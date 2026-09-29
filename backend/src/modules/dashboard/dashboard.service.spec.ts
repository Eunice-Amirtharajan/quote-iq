import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AppLogger } from '../../common/logger/logger.service';
import { Role } from '@prisma/client';
import type { User } from '@prisma/client';

const mockPrismaService = {
  quotation: {
    count: jest.fn(),
    aggregate: jest.fn(),
    groupBy: jest.fn(),
    findMany: jest.fn(),
  },
  user: {
    findMany: jest.fn(),
  },
  client: {
    findMany: jest.fn(),
  },
  $queryRaw: jest.fn(),
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

const mockUser = (role: Role): User => ({
  id: 'user-1',
  email: 'test@quoteiq.com',
  name: 'Test User',
  password: 'hash',
  role,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});

/** Default: every count returns 0, every aggregate returns null total */
function resetMocks() {
  mockPrismaService.quotation.count.mockResolvedValue(0);
  mockPrismaService.quotation.aggregate.mockResolvedValue({
    _sum: { total: null },
  });
  mockPrismaService.quotation.groupBy.mockResolvedValue([]);
  mockPrismaService.quotation.findMany.mockResolvedValue([]);
  mockPrismaService.user.findMany.mockResolvedValue([]);
  mockPrismaService.client.findMany.mockResolvedValue([]);
  mockPrismaService.$queryRaw.mockResolvedValue([]);
}

describe('DashboardService', () => {
  let service: DashboardService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AppLogger, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
    resetMocks();
  });

  afterEach(() => jest.clearAllMocks());

  describe('getStats — no date range', () => {
    it('returns zero stats when no quotations exist', async () => {
      const result = await service.getStats(mockUser(Role.SALES_MANAGER));

      expect(result).toMatchObject({
        totalQuotations: 0,
        totalSent: 0,
        totalApproved: 0,
        totalRejected: 0,
        conversionRate: 0,
        totalPipelineValue: 0,
        totalApprovedValue: 0,
        avgDealSize: 0,
      });
      // No range → no trend indicators
      expect(result.totalQuotationsTrend).toBeNull();
      expect(result.conversionRateTrend).toBeNull();
      expect(result.avgDealSizeTrend).toBeNull();
    });

    it('uses empty where clause for SALES_MANAGER', async () => {
      await service.getStats(mockUser(Role.SALES_MANAGER));
      expect(mockPrismaService.quotation.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it('filters by createdById for SALES_REP', async () => {
      await service.getStats(mockUser(Role.SALES_REP));
      expect(mockPrismaService.quotation.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: { createdById: 'user-1' } }),
      );
    });

    it('calculates conversion rate correctly', async () => {
      // 3 approved out of (3+4)=7 decided = 42.9%
      mockPrismaService.quotation.count
        .mockResolvedValueOnce(10) // totalQuotations
        .mockResolvedValueOnce(2)  // totalSent
        .mockResolvedValueOnce(3)  // totalApproved
        .mockResolvedValueOnce(4); // totalRejected

      const result = await service.getStats(mockUser(Role.SALES_MANAGER));
      expect(result.conversionRate).toBe(42.9);
    });

    it('returns zero conversion rate when no approved or rejected quotations', async () => {
      mockPrismaService.quotation.count
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      const result = await service.getStats(mockUser(Role.SALES_MANAGER));
      expect(result.conversionRate).toBe(0);
    });

    it('returns pipeline and approved values from aggregation', async () => {
      mockPrismaService.quotation.count.mockResolvedValue(5);
      mockPrismaService.quotation.aggregate
        .mockResolvedValueOnce({ _sum: { total: 50000 } })
        .mockResolvedValueOnce({ _sum: { total: 30000 } });

      const result = await service.getStats(mockUser(Role.SALES_MANAGER));
      expect(result.totalPipelineValue).toBe(50000);
      expect(result.totalApprovedValue).toBe(30000);
    });

    it('calculates avgDealSize as approvedValue / approvedCount', async () => {
      // 4 approved, totalApprovedValue = 60000 → avg = 15000
      mockPrismaService.quotation.count
        .mockResolvedValueOnce(10) // totalQuotations
        .mockResolvedValueOnce(2)  // totalSent
        .mockResolvedValueOnce(4)  // totalApproved
        .mockResolvedValueOnce(1); // totalRejected
      mockPrismaService.quotation.aggregate
        .mockResolvedValueOnce({ _sum: { total: 80000 } }) // pipeline
        .mockResolvedValueOnce({ _sum: { total: 60000 } }); // approved

      const result = await service.getStats(mockUser(Role.SALES_MANAGER));
      expect(result.avgDealSize).toBe(15000);
    });

    it('returns avgDealSize 0 when no approved quotations', async () => {
      mockPrismaService.quotation.count
        .mockResolvedValueOnce(5).mockResolvedValueOnce(3).mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      mockPrismaService.quotation.aggregate.mockResolvedValue({ _sum: { total: null } });

      const result = await service.getStats(mockUser(Role.SALES_MANAGER));
      expect(result.avgDealSize).toBe(0);
    });

    it('handles null aggregate sum gracefully', async () => {
      mockPrismaService.quotation.count.mockResolvedValue(0);
      mockPrismaService.quotation.aggregate.mockResolvedValue({ _sum: { total: null } });

      const result = await service.getStats(mockUser(Role.SALES_MANAGER));
      expect(result.totalPipelineValue).toBe(0);
      expect(result.totalApprovedValue).toBe(0);
    });

    it('throws and logs error when prisma fails', async () => {
      mockPrismaService.quotation.count.mockRejectedValue(new Error('DB error'));
      await expect(service.getStats(mockUser(Role.SALES_MANAGER))).rejects.toThrow('DB error');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('logs String(error) when a non-Error is thrown', async () => {
      mockPrismaService.quotation.count.mockRejectedValue('plain string error');
      await expect(service.getStats(mockUser(Role.SALES_MANAGER))).rejects.toBe('plain string error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(String),
        'plain string error',
        DashboardService.name,
      );
    });
  });

  describe('getStats — with date range', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const to = new Date('2026-03-31T23:59:59.999Z');

    it('returns trend indicators when from+to provided', async () => {
      // Current period: 10 total, 5 approved, 2 rejected → 71.4% rate
      // Previous period: 8 total, 4 approved, 3 rejected → 57.1% rate
      mockPrismaService.quotation.count
        // current: total, sent, approved, rejected
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(2)
        // previous: total, sent, approved, rejected
        .mockResolvedValueOnce(8)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(3);

      mockPrismaService.quotation.aggregate
        // current: pipeline, approved
        .mockResolvedValueOnce({ _sum: { total: 100000 } })
        .mockResolvedValueOnce({ _sum: { total: 60000 } })
        // previous: pipeline, approved
        .mockResolvedValueOnce({ _sum: { total: 80000 } })
        .mockResolvedValueOnce({ _sum: { total: 40000 } });

      const result = await service.getStats(mockUser(Role.SALES_MANAGER), from, to);

      expect(result.totalQuotations).toBe(10);
      expect(result.totalQuotationsTrend).toMatchObject({ delta: 2, direction: 'up' });
      expect(result.totalPipelineValueTrend).toMatchObject({ delta: 20000, direction: 'up' });
      expect(result.totalApprovedValueTrend).toMatchObject({ delta: 20000, direction: 'up' });
      // conversionRate: 5/(5+2)=71.4%, prev 4/(4+3)=57.1% → up
      expect(result.conversionRateTrend?.direction).toBe('up');
    });

    it('returns flat direction when values are equal', async () => {
      // Same values in both periods
      mockPrismaService.quotation.count.mockResolvedValue(5);
      mockPrismaService.quotation.aggregate.mockResolvedValue({ _sum: { total: 50000 } });

      const result = await service.getStats(mockUser(Role.SALES_MANAGER), from, to);
      expect(result.totalQuotationsTrend?.direction).toBe('flat');
      expect(result.totalPipelineValueTrend?.direction).toBe('flat');
    });

    it('returns down direction when current < previous', async () => {
      mockPrismaService.quotation.count
        .mockResolvedValueOnce(3) .mockResolvedValueOnce(1).mockResolvedValueOnce(1).mockResolvedValueOnce(1)
        .mockResolvedValueOnce(8) .mockResolvedValueOnce(3).mockResolvedValueOnce(4).mockResolvedValueOnce(2);

      mockPrismaService.quotation.aggregate
        .mockResolvedValueOnce({ _sum: { total: 20000 } }).mockResolvedValueOnce({ _sum: { total: 10000 } })
        .mockResolvedValueOnce({ _sum: { total: 80000 } }).mockResolvedValueOnce({ _sum: { total: 50000 } });

      const result = await service.getStats(mockUser(Role.SALES_MANAGER), from, to);
      expect(result.totalQuotationsTrend?.direction).toBe('down');
      expect(result.totalPipelineValueTrend?.direction).toBe('down');
    });

    it('handles zero previous-period total gracefully (pct = 100)', async () => {
      mockPrismaService.quotation.count
        .mockResolvedValueOnce(5).mockResolvedValueOnce(2).mockResolvedValueOnce(2).mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(0);

      mockPrismaService.quotation.aggregate
        .mockResolvedValueOnce({ _sum: { total: 50000 } }).mockResolvedValueOnce({ _sum: { total: 30000 } })
        .mockResolvedValueOnce({ _sum: { total: null } }).mockResolvedValueOnce({ _sum: { total: null } });

      const result = await service.getStats(mockUser(Role.SALES_MANAGER), from, to);
      expect(result.totalQuotationsTrend?.pct).toBe(100);
      expect(result.totalPipelineValueTrend?.pct).toBe(100);
    });

    it('returns avgDealSizeTrend when range provided', async () => {
      // current: 5 approved, €100k total → avg €20k
      // previous: 4 approved, €60k total → avg €15k → up
      mockPrismaService.quotation.count
        .mockResolvedValueOnce(10).mockResolvedValueOnce(3).mockResolvedValueOnce(5).mockResolvedValueOnce(2)
        .mockResolvedValueOnce(8) .mockResolvedValueOnce(2).mockResolvedValueOnce(4).mockResolvedValueOnce(2);
      mockPrismaService.quotation.aggregate
        .mockResolvedValueOnce({ _sum: { total: 80000 } }).mockResolvedValueOnce({ _sum: { total: 100000 } })
        .mockResolvedValueOnce({ _sum: { total: 60000 } }).mockResolvedValueOnce({ _sum: { total: 60000 } });

      const result = await service.getStats(mockUser(Role.SALES_MANAGER), from, to);
      expect(result.avgDealSizeTrend).toMatchObject({ direction: 'up' });
    });

    it('passes date filter to prisma where clause', async () => {
      await service.getStats(mockUser(Role.SALES_MANAGER), from, to);

      // First call is current period — should include createdAt filter
      expect(mockPrismaService.quotation.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ createdAt: expect.objectContaining({ gte: from, lte: to }) }),
        }),
      );
    });

    it('calculates previous period from "from only" range (no to)', async () => {
      // Provide all 8 count mocks + 4 aggregate mocks for current + previous
      mockPrismaService.quotation.count
        .mockResolvedValueOnce(5).mockResolvedValueOnce(2).mockResolvedValueOnce(2).mockResolvedValueOnce(1)
        .mockResolvedValueOnce(4).mockResolvedValueOnce(2).mockResolvedValueOnce(2).mockResolvedValueOnce(1);
      mockPrismaService.quotation.aggregate
        .mockResolvedValueOnce({ _sum: { total: 50000 } }).mockResolvedValueOnce({ _sum: { total: 30000 } })
        .mockResolvedValueOnce({ _sum: { total: 40000 } }).mockResolvedValueOnce({ _sum: { total: 25000 } });

      // pass only `from`, no `to` — triggers the "from only" branch
      const result = await service.getStats(mockUser(Role.SALES_MANAGER), from, undefined);

      expect(result.totalQuotationsTrend).toBeDefined();
    });
  });

  describe('getRepPerformance', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const to = new Date('2026-03-31T23:59:59.999Z');

    /** One groupBy row per (rep, status), shaped like Prisma's output */
    const row = (createdById: string, status: string, count: number, total: number | null = null) => ({
      createdById,
      status,
      _count: { _all: count },
      _sum: { total },
    });

    it('returns an empty array when no quotations have been sent', async () => {
      const result = await service.getRepPerformance();
      expect(result).toEqual([]);
    });

    it('aggregates sent, approved, revenue and win rate per rep', async () => {
      mockPrismaService.quotation.groupBy.mockResolvedValue([
        row('rep-a', 'SENT', 2, 10000),
        row('rep-a', 'APPROVED', 3, 45000.456),
        row('rep-a', 'REJECTED', 1, 8000),
      ]);
      mockPrismaService.user.findMany.mockResolvedValue([{ id: 'rep-a', name: 'Anna' }]);

      const [anna] = await service.getRepPerformance();

      expect(anna).toEqual({
        repId: 'rep-a',
        repName: 'Anna',
        isOthers: false,
        totalSent: 6, // SENT + APPROVED + REJECTED
        totalApproved: 3,
        approvedRevenue: 45000.46, // only APPROVED revenue, rounded to 2dp
        winRate: 75, // 3 / (3 + 1)
      });
    });

    it('sorts by approved revenue desc, breaking ties by name', async () => {
      mockPrismaService.quotation.groupBy.mockResolvedValue([
        row('rep-c', 'APPROVED', 1, 5000),
        row('rep-b', 'APPROVED', 1, 9000),
        row('rep-a', 'APPROVED', 1, 9000),
      ]);
      mockPrismaService.user.findMany.mockResolvedValue([
        { id: 'rep-a', name: 'Zoe' },
        { id: 'rep-b', name: 'Adam' },
        { id: 'rep-c', name: 'Carl' },
      ]);

      const result = await service.getRepPerformance();
      expect(result.map((r) => r.repName)).toEqual(['Adam', 'Zoe', 'Carl']);
    });

    it('returns win rate 0 for a rep with no decided quotations', async () => {
      mockPrismaService.quotation.groupBy.mockResolvedValue([row('rep-a', 'SENT', 4, 20000)]);
      mockPrismaService.user.findMany.mockResolvedValue([{ id: 'rep-a', name: 'Anna' }]);

      const [anna] = await service.getRepPerformance();
      expect(anna).toMatchObject({ totalSent: 4, totalApproved: 0, approvedRevenue: 0, winRate: 0 });
    });

    it('falls back to "Unknown" when the rep user no longer exists', async () => {
      mockPrismaService.quotation.groupBy.mockResolvedValue([row('ghost', 'APPROVED', 1, 1000)]);

      const [rep] = await service.getRepPerformance();
      expect(rep.repName).toBe('Unknown');
    });

    it('omits the others row when there are 10 reps or fewer', async () => {
      const ids = Array.from({ length: 10 }, (_, i) => `rep-${i}`);
      mockPrismaService.quotation.groupBy.mockResolvedValue(
        ids.map((id, i) => row(id, 'APPROVED', 1, 1000 * (i + 1))),
      );

      const result = await service.getRepPerformance();
      expect(result).toHaveLength(10);
      expect(result.some((r) => r.isOthers)).toBe(false);
    });

    it('keeps the top 10 and pools the remainder into one others row', async () => {
      // 12 reps: rep-0 earns least, rep-11 most → rep-0 and rep-1 fall outside the top 10
      const ids = Array.from({ length: 12 }, (_, i) => `rep-${i}`);
      mockPrismaService.quotation.groupBy.mockResolvedValue([
        ...ids.map((id, i) => row(id, 'APPROVED', 1, 1000 * (i + 1))),
        // pooled: 2 approved, 4 rejected → win rate 2 / (2 + 4) = 33.3%
        row('rep-0', 'REJECTED', 3),
        row('rep-1', 'REJECTED', 1),
      ]);
      mockPrismaService.user.findMany.mockResolvedValue(
        ids.map((id) => ({ id, name: id })),
      );

      const result = await service.getRepPerformance();

      expect(result).toHaveLength(11);
      expect(result[0].repId).toBe('rep-11');
      expect(result.slice(0, 10).every((r) => !r.isOthers)).toBe(true);
      expect(result[10]).toEqual({
        repId: null,
        repName: '2 others',
        isOthers: true,
        totalSent: 6,
        totalApproved: 2,
        approvedRevenue: 3000, // 1000 + 2000
        winRate: 33.3,
      });
    });

    it('filters to sent-or-later statuses and applies the date range', async () => {
      await service.getRepPerformance(from, to);

      expect(mockPrismaService.quotation.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ['createdById', 'status'],
          where: {
            status: { in: ['SENT', 'APPROVED', 'REJECTED'] },
            createdAt: { gte: from, lte: to },
          },
        }),
      );
    });

    it('omits the createdAt filter when no range is given', async () => {
      await service.getRepPerformance();

      const { where } = mockPrismaService.quotation.groupBy.mock.calls[0][0];
      expect(where).not.toHaveProperty('createdAt');
    });

    it('throws and logs error when prisma fails', async () => {
      mockPrismaService.quotation.groupBy.mockRejectedValue(new Error('DB error'));
      await expect(service.getRepPerformance()).rejects.toThrow('DB error');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('logs String(error) when a non-Error is thrown', async () => {
      mockPrismaService.quotation.groupBy.mockRejectedValue('plain string error');
      await expect(service.getRepPerformance()).rejects.toBe('plain string error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(String),
        'plain string error',
        DashboardService.name,
      );
    });
  });

  describe('getClientConcentration', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const to = new Date('2026-03-31T23:59:59.999Z');

    const row = (clientId: string, count: number, total: number | null) => ({
      clientId,
      _count: { _all: count },
      _sum: { total },
    });

    it('returns an empty array when there is no approved revenue', async () => {
      const result = await service.getClientConcentration();
      expect(result).toEqual([]);
    });

    it('maps each client to revenue, share of total and quote count', async () => {
      mockPrismaService.quotation.groupBy.mockResolvedValue([
        row('c-1', 4, 34000.123),
        row('c-2', 2, 16000),
      ]);
      mockPrismaService.quotation.aggregate.mockResolvedValue({ _sum: { total: 100000 } });
      mockPrismaService.client.findMany.mockResolvedValue([
        { id: 'c-1', name: 'Bauer Logistics' },
        { id: 'c-2', name: 'Vogel Digital' },
      ]);

      const result = await service.getClientConcentration();

      expect(result).toEqual([
        { clientId: 'c-1', clientName: 'Bauer Logistics', approvedRevenue: 34000.12, shareOfTotal: 34, quoteCount: 4 },
        { clientId: 'c-2', clientName: 'Vogel Digital', approvedRevenue: 16000, shareOfTotal: 16, quoteCount: 2 },
      ]);
    });

    it('computes share against the total across all clients, not just the top 10', async () => {
      // One client shown, but the overall total includes clients outside the top N
      mockPrismaService.quotation.groupBy.mockResolvedValue([row('c-1', 1, 1000)]);
      mockPrismaService.quotation.aggregate.mockResolvedValue({ _sum: { total: 3000 } });

      const [client] = await service.getClientConcentration();
      expect(client.shareOfTotal).toBe(33.3);
    });

    it('returns share 0 and falls back to "Unknown" on missing data', async () => {
      mockPrismaService.quotation.groupBy.mockResolvedValue([row('ghost', 1, null)]);
      mockPrismaService.quotation.aggregate.mockResolvedValue({ _sum: { total: null } });

      const [client] = await service.getClientConcentration();
      expect(client).toMatchObject({ clientName: 'Unknown', approvedRevenue: 0, shareOfTotal: 0 });
    });

    it('ranks and limits in SQL, filtered to APPROVED within the range', async () => {
      await service.getClientConcentration(from, to);

      const where = { status: 'APPROVED', createdAt: { gte: from, lte: to } };
      expect(mockPrismaService.quotation.groupBy).toHaveBeenCalledWith({
        by: ['clientId'],
        where,
        _count: { _all: true },
        _sum: { total: true },
        orderBy: [{ _sum: { total: 'desc' } }, { clientId: 'asc' }],
        take: 10,
      });
      expect(mockPrismaService.quotation.aggregate).toHaveBeenCalledWith({
        where,
        _sum: { total: true },
      });
    });

    it('omits the createdAt filter when no range is given', async () => {
      await service.getClientConcentration();

      const { where } = mockPrismaService.quotation.groupBy.mock.calls[0][0];
      expect(where).toEqual({ status: 'APPROVED' });
    });

    it('throws and logs error when prisma fails', async () => {
      mockPrismaService.quotation.groupBy.mockRejectedValue(new Error('DB error'));
      await expect(service.getClientConcentration()).rejects.toThrow('DB error');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('logs String(error) when a non-Error is thrown', async () => {
      mockPrismaService.quotation.groupBy.mockRejectedValue('plain string error');
      await expect(service.getClientConcentration()).rejects.toBe('plain string error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(String),
        'plain string error',
        DashboardService.name,
      );
    });
  });

  describe('getApprovalRateTrend', () => {
    const now = new Date('2026-09-15T10:00:00.000Z');

    /** Months as $queryRaw returns them: COUNT(*) comes back as bigint */
    const month = (m: string, sent: number, approved: number, rejected: number) => ({
      month: m,
      sent: BigInt(sent),
      approved: BigInt(approved),
      rejected: BigInt(rejected),
    });

    it('always returns 12 months, oldest first, ending with the current month', async () => {
      const result = await service.getApprovalRateTrend(now);

      expect(result).toHaveLength(12);
      expect(result[0].month).toBe('2025-10');
      expect(result[11].month).toBe('2026-09');
    });

    it('fills months with no activity as zeros and a null rate', async () => {
      const result = await service.getApprovalRateTrend(now);
      expect(result[5]).toEqual({ month: '2026-03', sent: 0, approved: 0, rejected: 0, rate: null });
    });

    it('maps bigint counts and computes the rate per month', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        month('2026-09', 20, 6, 2),
        month('2025-10', 5, 1, 2),
      ]);

      const result = await service.getApprovalRateTrend(now);

      expect(result[0]).toEqual({ month: '2025-10', sent: 5, approved: 1, rejected: 2, rate: 33.3 });
      expect(result[11]).toEqual({ month: '2026-09', sent: 20, approved: 6, rejected: 2, rate: 75 });
    });

    it('returns a null rate for a month with sends but no decisions', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([month('2026-09', 12, 0, 0)]);

      const result = await service.getApprovalRateTrend(now);
      expect(result[11]).toMatchObject({ sent: 12, rate: null });
    });

    it('returns rate 0 (not null) when every decision was a rejection', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([month('2026-09', 3, 0, 3)]);

      const result = await service.getApprovalRateTrend(now);
      expect(result[11].rate).toBe(0);
    });

    it('queries from the first day of the oldest month, across a year boundary', async () => {
      const result = await service.getApprovalRateTrend(new Date('2026-01-20T00:00:00.000Z'));

      const query = mockPrismaService.$queryRaw.mock.calls[0][0];
      expect(query.values).toEqual([new Date('2025-02-01T00:00:00.000Z')]);
      expect(query.sql).toContain('date_trunc');
      expect(result[0].month).toBe('2025-02');
      expect(result[11].month).toBe('2026-01');
    });

    it('defaults to the current date when no "now" is passed', async () => {
      const result = await service.getApprovalRateTrend();
      expect(result[11].month).toBe(new Date().toISOString().slice(0, 7));
    });

    it('throws and logs error when the query fails', async () => {
      mockPrismaService.$queryRaw.mockRejectedValue(new Error('DB error'));
      await expect(service.getApprovalRateTrend(now)).rejects.toThrow('DB error');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('logs String(error) when a non-Error is thrown', async () => {
      mockPrismaService.$queryRaw.mockRejectedValue('plain string error');
      await expect(service.getApprovalRateTrend(now)).rejects.toBe('plain string error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(String),
        'plain string error',
        DashboardService.name,
      );
    });
  });

  describe('getDealVelocity', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const to = new Date('2026-03-31T23:59:59.999Z');

    const velocity = (transition: string, avg: number, p90: number, n: number) => ({
      transition,
      avg_days: avg,
      p90_days: p90,
      sample_size: BigInt(n),
    });

    it('returns all four transitions in a fixed order', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        velocity('FULL_CYCLE', 16.54, 26.91, 40),
        velocity('DRAFT_TO_SENT', 3.04, 5.83, 50),
        velocity('SENT_TO_REJECTED', 20.11, 32.95, 10),
        velocity('SENT_TO_APPROVED', 11.62, 20.94, 30),
      ]);

      const result = await service.getDealVelocity();

      expect(result).toEqual([
        { transition: 'DRAFT_TO_SENT', avgDays: 3, p90Days: 5.8, sampleSize: 50 },
        { transition: 'SENT_TO_APPROVED', avgDays: 11.6, p90Days: 20.9, sampleSize: 30 },
        { transition: 'SENT_TO_REJECTED', avgDays: 20.1, p90Days: 33, sampleSize: 10 },
        { transition: 'FULL_CYCLE', avgDays: 16.5, p90Days: 26.9, sampleSize: 40 },
      ]);
    });

    it('returns null durations and a zero sample size for transitions with no data', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([velocity('DRAFT_TO_SENT', 2, 4, 5)]);

      const result = await service.getDealVelocity();

      expect(result).toHaveLength(4);
      expect(result[1]).toEqual({ transition: 'SENT_TO_APPROVED', avgDays: null, p90Days: null, sampleSize: 0 });
    });

    it('applies both range bounds to the transition end time', async () => {
      await service.getDealVelocity(from, to);

      const query = mockPrismaService.$queryRaw.mock.calls[0][0];
      expect(query.sql).toContain('ended_at >=');
      expect(query.sql).toContain('ended_at <=');
      expect(query.values).toEqual([from, to]);
    });

    it('applies only the lower bound when "to" is omitted', async () => {
      await service.getDealVelocity(from);

      const query = mockPrismaService.$queryRaw.mock.calls[0][0];
      expect(query.sql).toContain('ended_at >=');
      expect(query.sql).not.toContain('ended_at <=');
      expect(query.values).toEqual([from]);
    });

    it('applies no date filter when no range is given', async () => {
      await service.getDealVelocity();

      const query = mockPrismaService.$queryRaw.mock.calls[0][0];
      expect(query.sql).not.toContain('ended_at >=');
      expect(query.values).toEqual([]);
    });

    it('throws and logs error when the query fails', async () => {
      mockPrismaService.$queryRaw.mockRejectedValue(new Error('DB error'));
      await expect(service.getDealVelocity()).rejects.toThrow('DB error');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('logs String(error) when a non-Error is thrown', async () => {
      mockPrismaService.$queryRaw.mockRejectedValue('plain string error');
      await expect(service.getDealVelocity()).rejects.toBe('plain string error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(String),
        'plain string error',
        DashboardService.name,
      );
    });
  });

  describe('getStaleQuotations', () => {
    const now = new Date('2026-09-25T12:00:00.000Z');
    const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

    const quote = (id: string, updatedAt: Date, total = 10000) => ({
      id,
      quotationNumber: `QT-${id}`,
      title: `Quote ${id}`,
      total,
      updatedAt,
      client: { id: 'c-1', name: 'Bauer Logistics' },
      createdBy: { name: 'Anna' },
    });

    it('returns an empty pipeline when nothing is stale', async () => {
      const result = await service.getStaleQuotations(14, now);
      expect(result).toEqual({ thresholdDays: 14, totalCount: 0, totalValue: 0, items: [] });
    });

    it('maps rows with whole days stale and the send time', async () => {
      const sentAt = new Date(now.getTime() - 20.9 * 86_400_000);
      mockPrismaService.quotation.findMany.mockResolvedValue([quote('1', sentAt, 38200)]);

      const { items } = await service.getStaleQuotations(14, now);

      expect(items).toEqual([
        {
          id: '1',
          quotationNumber: 'QT-1',
          title: 'Quote 1',
          clientId: 'c-1',
          clientName: 'Bauer Logistics',
          repName: 'Anna',
          total: 38200,
          sentAt: sentAt.toISOString(),
          daysStale: 20, // floored, not rounded
        },
      ]);
    });

    it('reports count and value for all stale quotations, not just the capped list', async () => {
      mockPrismaService.quotation.findMany.mockResolvedValue([quote('1', daysAgo(30))]);
      mockPrismaService.quotation.count.mockResolvedValue(72);
      mockPrismaService.quotation.aggregate.mockResolvedValue({ _sum: { total: 2534830.774 } });

      const result = await service.getStaleQuotations(14, now);
      expect(result).toMatchObject({ totalCount: 72, totalValue: 2534830.77 });
    });

    it('queries SENT quotations older than the threshold, most stale first, capped at 50', async () => {
      await service.getStaleQuotations(21, now);

      const where = { status: 'SENT', updatedAt: { lt: daysAgo(21) } };
      expect(mockPrismaService.quotation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where,
          orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
          take: 50,
        }),
      );
      expect(mockPrismaService.quotation.count).toHaveBeenCalledWith({ where });
      expect(mockPrismaService.quotation.aggregate).toHaveBeenCalledWith({ where, _sum: { total: true } });
    });

    it('defaults to a 14-day threshold', async () => {
      const result = await service.getStaleQuotations();
      expect(result.thresholdDays).toBe(14);
    });

    it.each([
      [0, 1],
      [-5, 1],
      [1000, 365],
    ])('clamps a threshold of %i days to %i', async (requested, applied) => {
      const result = await service.getStaleQuotations(requested, now);

      expect(result.thresholdDays).toBe(applied);
      const { where } = mockPrismaService.quotation.findMany.mock.calls[0][0];
      expect(where.updatedAt.lt).toEqual(daysAgo(applied));
    });

    it('throws and logs error when prisma fails', async () => {
      mockPrismaService.quotation.findMany.mockRejectedValue(new Error('DB error'));
      await expect(service.getStaleQuotations(14, now)).rejects.toThrow('DB error');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('logs String(error) when a non-Error is thrown', async () => {
      mockPrismaService.quotation.findMany.mockRejectedValue('plain string error');
      await expect(service.getStaleQuotations(14, now)).rejects.toBe('plain string error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(String),
        'plain string error',
        DashboardService.name,
      );
    });
  });

  describe('getQuarterlyHistory', () => {
    const now = new Date('2026-09-25T12:00:00.000Z');

    const stats = (key: string, total: number, approved: number, rejected: number, revenue: number) => ({
      key,
      total: BigInt(total),
      approved: BigInt(approved),
      rejected: BigInt(rejected),
      revenue,
    });
    const topClient = (key: string, id: string, revenue: number) => ({
      key,
      client_id: id,
      name: `client ${id}`,
      revenue,
    });

    /** Stats query runs first, top-clients second — mirrors the Promise.all order */
    const mockQueries = (statRows: unknown[], clientRows: unknown[]) =>
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce(statRows)
        .mockResolvedValueOnce(clientRows);

    it('returns the last 4 quarters oldest first, flagging the current one', async () => {
      const result = await service.getQuarterlyHistory(4, now);

      expect(result.map((q) => q.quarter)).toEqual(['Q4 2025', 'Q1 2026', 'Q2 2026', 'Q3 2026']);
      expect(result.map((q) => q.isCurrent)).toEqual([false, false, false, true]);
      expect(result[0]).toMatchObject({
        from: '2025-10-01T00:00:00.000Z',
        to: '2025-12-31T23:59:59.999Z',
      });
      expect(result[3].to).toBe('2026-09-30T23:59:59.999Z');
    });

    it('crosses year boundaries when counting back', async () => {
      const result = await service.getQuarterlyHistory(4, new Date('2026-02-10T00:00:00.000Z'));
      expect(result.map((q) => q.quarter)).toEqual(['Q2 2025', 'Q3 2025', 'Q4 2025', 'Q1 2026']);
    });

    it('returns zeros for a quarter with no quotations so the grid never shifts', async () => {
      const [first] = await service.getQuarterlyHistory(4, now);
      expect(first).toMatchObject({
        totalQuotations: 0,
        totalApproved: 0,
        approvedRevenue: 0,
        winRate: 0,
        avgDealSize: 0,
        topClients: [],
      });
    });

    it('maps stats and derives win rate and average deal size', async () => {
      mockQueries([stats('2026-3', 2167, 877, 226, 31999640.734)], []);

      const current = (await service.getQuarterlyHistory(4, now))[3];

      expect(current).toMatchObject({
        totalQuotations: 2167,
        totalApproved: 877,
        approvedRevenue: 31999640.73,
        winRate: 79.5, // 877 / (877 + 226)
        avgDealSize: 36487.62,
      });
    });

    it('attaches each quarter its own top clients in rank order', async () => {
      mockQueries(
        [stats('2026-2', 10, 5, 2, 50000), stats('2026-3', 12, 6, 2, 60000)],
        [
          topClient('2026-2', 'a', 30000.456),
          topClient('2026-2', 'b', 20000),
          topClient('2026-3', 'c', 40000),
        ],
      );

      const result = await service.getQuarterlyHistory(4, now);

      expect(result[2].topClients).toEqual([
        { clientId: 'a', name: 'client a', revenue: 30000.46 },
        { clientId: 'b', name: 'client b', revenue: 20000 },
      ]);
      expect(result[3].topClients).toEqual([{ clientId: 'c', name: 'client c', revenue: 40000 }]);
    });

    it('queries both result sets from the start of the oldest quarter', async () => {
      await service.getQuarterlyHistory(4, now);

      const start = new Date('2025-10-01T00:00:00.000Z');
      const [statsQuery] = mockPrismaService.$queryRaw.mock.calls[0];
      const [clientsQuery] = mockPrismaService.$queryRaw.mock.calls[1];
      expect(statsQuery.sql).toContain(`date_trunc('quarter'`);
      expect(statsQuery.values).toEqual([start]);
      expect(clientsQuery.sql).toContain('ROW_NUMBER()');
      expect(clientsQuery.values).toEqual([start, 2]);
    });

    it('defaults to 4 quarters', async () => {
      const result = await service.getQuarterlyHistory();
      expect(result).toHaveLength(4);
      expect(result[3].isCurrent).toBe(true);
    });

    it.each([
      [0, 1],
      [99, 8],
    ])('clamps a request for %i quarters to %i', async (requested, applied) => {
      const result = await service.getQuarterlyHistory(requested, now);
      expect(result).toHaveLength(applied);
      expect(result[applied - 1].quarter).toBe('Q3 2026');
    });

    it('throws and logs error when the query fails', async () => {
      mockPrismaService.$queryRaw.mockRejectedValue(new Error('DB error'));
      await expect(service.getQuarterlyHistory(4, now)).rejects.toThrow('DB error');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('logs String(error) when a non-Error is thrown', async () => {
      mockPrismaService.$queryRaw.mockRejectedValue('plain string error');
      await expect(service.getQuarterlyHistory(4, now)).rejects.toBe('plain string error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(String),
        'plain string error',
        DashboardService.name,
      );
    });
  });

  describe('getStats — deal size distribution', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const to = new Date('2026-03-31T23:59:59.999Z');

    it('returns median and p90 of approved deal values, rounded to 2dp', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([{ median: 14200.456, p90: 42100 }]);

      const result = await service.getStats(mockUser(Role.SALES_MANAGER));

      expect(result).toMatchObject({ medianDealSize: 14200.46, p90DealSize: 42100 });
    });

    it('returns null percentiles when nothing was approved', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([{ median: null, p90: null }]);

      const result = await service.getStats(mockUser(Role.SALES_MANAGER));

      expect(result).toMatchObject({ medianDealSize: null, p90DealSize: null });
    });

    it('computes percentiles over all approved quotations for a manager', async () => {
      await service.getStats(mockUser(Role.SALES_MANAGER));

      const query = mockPrismaService.$queryRaw.mock.calls[0][0];
      expect(query.sql).toContain('PERCENTILE_CONT(0.5)');
      expect(query.sql).toContain('PERCENTILE_CONT(0.9)');
      expect(query.sql).not.toContain('"createdById"');
      expect(query.values).toEqual([]);
    });

    it('scopes percentiles to the rep and the date range for a SALES_REP', async () => {
      await service.getStats(mockUser(Role.SALES_REP), from, to);

      const query = mockPrismaService.$queryRaw.mock.calls[0][0];
      expect(query.sql).toContain('"createdById" =');
      expect(query.values).toEqual(['user-1', from, to]);
    });

    it('computes percentiles only for the current period, not the comparison period', async () => {
      await service.getStats(mockUser(Role.SALES_MANAGER), from, to);
      expect(mockPrismaService.$queryRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe('getRepPerformance — limit', () => {
    const row = (createdById: string, revenue: number) => ({
      createdById,
      status: 'APPROVED',
      _count: { _all: 1 },
      _sum: { total: revenue },
    });
    const twelveReps = Array.from({ length: 12 }, (_, i) => row(`rep-${i}`, 1000 * (i + 1)));

    it('lists only the requested number of reps and pools the rest', async () => {
      mockPrismaService.quotation.groupBy.mockResolvedValue(twelveReps);

      const result = await service.getRepPerformance(undefined, undefined, 5);

      expect(result).toHaveLength(6);
      expect(result.slice(0, 5).map((r) => r.repId)).toEqual(['rep-11', 'rep-10', 'rep-9', 'rep-8', 'rep-7']);
      expect(result[5]).toMatchObject({ isOthers: true, repName: '7 others', approvedRevenue: 28000 });
    });

    it.each([
      [0, 1],
      [50, 12],
    ])('clamps a limit of %i (lists %i reps individually)', async (limit, listed) => {
      mockPrismaService.quotation.groupBy.mockResolvedValue(twelveReps);

      const result = await service.getRepPerformance(undefined, undefined, limit);

      expect(result.filter((r) => !r.isOthers)).toHaveLength(listed);
    });
  });

  describe('getQuarterlyHistory — pipeline value', () => {
    it('returns SENT + APPROVED value per quarter as pipelineValue', async () => {
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([
          { key: '2026-3', total: BigInt(10), approved: BigInt(4), rejected: BigInt(2), revenue: 40000, pipeline: 65000.126 },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.getQuarterlyHistory(4, new Date('2026-09-25T12:00:00.000Z'));

      expect(result[3]).toMatchObject({ pipelineValue: 65000.13, approvedRevenue: 40000 });
      expect(result[0].pipelineValue).toBe(0);
      const [statsQuery] = mockPrismaService.$queryRaw.mock.calls[0];
      expect(statsQuery.sql).toContain("status IN ('SENT', 'APPROVED')");
    });
  });

  describe('getRepDealSizeWinRates', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const to = new Date('2026-03-31T23:59:59.999Z');

    const row = (repId: string, bucket: string, approved: number, rejected: number) => ({
      rep_id: repId,
      bucket,
      approved: BigInt(approved),
      rejected: BigInt(rejected),
    });

    it('returns empty rows but a full zeroed baseline when nothing was decided', async () => {
      const result = await service.getRepDealSizeWinRates();

      expect(result.buckets).toEqual(['<5k', '5k–20k', '>20k']);
      expect(result.reps).toEqual([]);
      expect(result.totalReps).toBe(0);
      expect(result.teamAverage).toEqual([
        { bucket: '<5k', approved: 0, rejected: 0, decided: 0, winRate: null },
        { bucket: '5k–20k', approved: 0, rejected: 0, decided: 0, winRate: null },
        { bucket: '>20k', approved: 0, rejected: 0, decided: 0, winRate: null },
      ]);
    });

    it('builds one cell per band per rep, filling bands with no deals', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([row('tom', '>20k', 3, 7), row('tom', '5k–20k', 5, 5)]);
      mockPrismaService.user.findMany.mockResolvedValue([{ id: 'tom', name: 'Tom Muller' }]);

      const [tom] = (await service.getRepDealSizeWinRates()).reps;

      expect(tom).toEqual({
        repId: 'tom',
        repName: 'Tom Muller',
        decided: 20,
        winRate: 40, // 8 / 20
        cells: [
          { bucket: '<5k', approved: 0, rejected: 0, decided: 0, winRate: null },
          { bucket: '5k–20k', approved: 5, rejected: 5, decided: 10, winRate: 50 },
          { bucket: '>20k', approved: 3, rejected: 7, decided: 10, winRate: 30 },
        ],
      });
    });

    it('sums every rep into the team baseline per band', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        row('anna', '>20k', 8, 2),
        row('tom', '>20k', 3, 7),
        row('tom', '<5k', 1, 0),
      ]);

      const { teamAverage } = await service.getRepDealSizeWinRates();

      expect(teamAverage[2]).toEqual({ bucket: '>20k', approved: 11, rejected: 9, decided: 20, winRate: 55 });
      expect(teamAverage[0]).toMatchObject({ decided: 1, winRate: 100 });
    });

    it('orders reps by decided volume, name as a tie-break, and falls back to "Unknown"', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        row('small', '<5k', 1, 1),
        row('big', '>20k', 30, 10),
        row('zed', '5k–20k', 1, 1),
        row('ghost', '5k–20k', 1, 1),
      ]);
      mockPrismaService.user.findMany.mockResolvedValue([
        { id: 'small', name: 'Amy' },
        { id: 'big', name: 'Bea' },
        { id: 'zed', name: 'Zoe' },
      ]);

      const { reps } = await service.getRepDealSizeWinRates();

      expect(reps.map((r) => r.repName)).toEqual(['Bea', 'Amy', 'Unknown', 'Zoe']);
    });

    it('paginates reps while the baseline still covers every rep', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue(
        Array.from({ length: 12 }, (_, i) => row(`rep-${i}`, '>20k', 12 - i, 1)),
      );

      const page = await service.getRepDealSizeWinRates(undefined, undefined, 10, 10);

      expect(page).toMatchObject({ totalReps: 12, offset: 10, limit: 10 });
      expect(page.reps.map((r) => r.repId)).toEqual(['rep-10', 'rep-11']);
      expect(page.teamAverage[2].decided).toBe(90); // (12+11+…+1) approved + 12 rejected
    });

    it.each([
      [0, -5, 1, 0],
      [500, 3, 50, 3],
    ])('clamps limit %i / offset %i to %i / %i', async (limit, offset, appliedLimit, appliedOffset) => {
      const result = await service.getRepDealSizeWinRates(undefined, undefined, offset, limit);
      expect(result).toMatchObject({ limit: appliedLimit, offset: appliedOffset });
    });

    it('buckets by deal size in SQL with the same thresholds as win/loss analysis, and applies the range', async () => {
      await service.getRepDealSizeWinRates(from, to);

      const query = mockPrismaService.$queryRaw.mock.calls[0][0];
      expect(query.sql).toContain('WHEN total < 5000');
      expect(query.sql).toContain('WHEN total <= 20000');
      expect(query.sql).toContain("status IN ('APPROVED', 'REJECTED')");
      expect(query.values).toEqual([from, to]);
    });

    it('applies no date filter without a range', async () => {
      await service.getRepDealSizeWinRates();
      expect(mockPrismaService.$queryRaw.mock.calls[0][0].values).toEqual([]);
    });

    it('throws and logs error when the query fails', async () => {
      mockPrismaService.$queryRaw.mockRejectedValue(new Error('DB error'));
      await expect(service.getRepDealSizeWinRates()).rejects.toThrow('DB error');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('logs String(error) when a non-Error is thrown', async () => {
      mockPrismaService.$queryRaw.mockRejectedValue('plain string error');
      await expect(service.getRepDealSizeWinRates()).rejects.toBe('plain string error');
      expect(mockLogger.error).toHaveBeenCalledWith(expect.any(String), 'plain string error', DashboardService.name);
    });
  });
});

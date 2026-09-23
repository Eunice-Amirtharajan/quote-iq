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
  },
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
  createdAt: new Date(),
  updatedAt: new Date(),
});

/** Default: every count returns 0, every aggregate returns null total */
function resetMocks() {
  mockPrismaService.quotation.count.mockResolvedValue(0);
  mockPrismaService.quotation.aggregate.mockResolvedValue({
    _sum: { total: null },
  });
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
});

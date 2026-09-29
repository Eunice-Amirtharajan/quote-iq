import { Test, TestingModule } from '@nestjs/testing';
import { DashboardResolver } from './dashboard.resolver';
import { DashboardService } from './dashboard.service';
import { Role } from '@prisma/client';
import type { User } from '@prisma/client';

const mockDashboardService = {
  getStats: jest.fn(),
  getRepPerformance: jest.fn(),
  getClientConcentration: jest.fn(),
  getApprovalRateTrend: jest.fn(),
  getDealVelocity: jest.fn(),
  getStaleQuotations: jest.fn(),
  getQuarterlyHistory: jest.fn(),
  getRepDealSizeWinRates: jest.fn(),
};

const mockUser: User = {
  id: 'user-1',
  email: 'marcus@quoteiq.com',
  name: 'Marcus Klein',
  password: 'hash',
  role: Role.SALES_MANAGER,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockStats = {
  totalQuotations: 10,
  totalSent: 3,
  totalApproved: 5,
  totalRejected: 2,
  conversionRate: 50,
  totalPipelineValue: 30000,
  totalApprovedValue: 50000,
};

describe('DashboardResolver', () => {
  let resolver: DashboardResolver;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardResolver,
        { provide: DashboardService, useValue: mockDashboardService },
      ],
    }).compile();

    resolver = module.get<DashboardResolver>(DashboardResolver);
  });

  afterEach(() => jest.clearAllMocks());

  describe('dashboardStats', () => {
    it('returns stats for current user (no range)', async () => {
      mockDashboardService.getStats.mockResolvedValue(mockStats);

      const result = await resolver.dashboardStats(mockUser);

      expect(mockDashboardService.getStats).toHaveBeenCalledWith(mockUser, undefined, undefined);
      expect(result).toEqual(mockStats);
    });

    it('passes parsed Date objects when range is provided', async () => {
      mockDashboardService.getStats.mockResolvedValue(mockStats);

      const from = '2026-01-01T00:00:00.000Z';
      const to = '2026-03-31T23:59:59.999Z';
      await resolver.dashboardStats(mockUser, { from, to });

      expect(mockDashboardService.getStats).toHaveBeenCalledWith(
        mockUser,
        new Date(from),
        new Date(to),
      );
    });

    it('propagates error when service throws', async () => {
      mockDashboardService.getStats.mockRejectedValue(new Error('DB error'));

      await expect(resolver.dashboardStats(mockUser)).rejects.toThrow(
        'DB error',
      );
    });
  });

  describe('repPerformance', () => {
    const rows = [{ repId: 'rep-a', repName: 'Anna', isOthers: false, totalSent: 5, totalApproved: 3, approvedRevenue: 9000, winRate: 75 }];

    it('returns rows for all time when no range is given', async () => {
      mockDashboardService.getRepPerformance.mockResolvedValue(rows);

      const result = await resolver.repPerformance();

      expect(mockDashboardService.getRepPerformance).toHaveBeenCalledWith(undefined, undefined, 10);
      expect(result).toEqual(rows);
    });

    it('passes parsed Date objects and the limit through', async () => {
      mockDashboardService.getRepPerformance.mockResolvedValue(rows);

      const from = '2026-01-01T00:00:00.000Z';
      await resolver.repPerformance({ from }, 5);

      expect(mockDashboardService.getRepPerformance).toHaveBeenCalledWith(new Date(from), undefined, 5);
    });

    it('propagates error when service throws', async () => {
      mockDashboardService.getRepPerformance.mockRejectedValue(new Error('DB error'));
      await expect(resolver.repPerformance()).rejects.toThrow('DB error');
    });
  });

  describe('clientConcentration', () => {
    const rows = [{ clientId: 'c-1', clientName: 'Bauer', approvedRevenue: 34000, shareOfTotal: 34, quoteCount: 4 }];

    it('returns rows for all time when no range is given', async () => {
      mockDashboardService.getClientConcentration.mockResolvedValue(rows);

      const result = await resolver.clientConcentration();

      expect(mockDashboardService.getClientConcentration).toHaveBeenCalledWith(undefined, undefined);
      expect(result).toEqual(rows);
    });

    it('passes parsed Date objects when range is provided', async () => {
      mockDashboardService.getClientConcentration.mockResolvedValue(rows);

      const from = '2026-01-01T00:00:00.000Z';
      const to = '2026-03-31T23:59:59.999Z';
      await resolver.clientConcentration({ from, to });

      expect(mockDashboardService.getClientConcentration).toHaveBeenCalledWith(new Date(from), new Date(to));
    });

    it('propagates error when service throws', async () => {
      mockDashboardService.getClientConcentration.mockRejectedValue(new Error('DB error'));
      await expect(resolver.clientConcentration()).rejects.toThrow('DB error');
    });
  });

  describe('approvalRateTrend', () => {
    it('returns the fixed 12-month trend from the service', async () => {
      const months = [{ month: '2026-09', sent: 20, approved: 6, rejected: 2, rate: 75 }];
      mockDashboardService.getApprovalRateTrend.mockResolvedValue(months);

      const result = await resolver.approvalRateTrend();

      expect(mockDashboardService.getApprovalRateTrend).toHaveBeenCalledWith();
      expect(result).toEqual(months);
    });

    it('propagates error when service throws', async () => {
      mockDashboardService.getApprovalRateTrend.mockRejectedValue(new Error('DB error'));
      await expect(resolver.approvalRateTrend()).rejects.toThrow('DB error');
    });
  });

  describe('dealVelocity', () => {
    const rows = [{ transition: 'DRAFT_TO_SENT', avgDays: 3, p90Days: 5.8, sampleSize: 50 }];

    it('returns rows for all time when no range is given', async () => {
      mockDashboardService.getDealVelocity.mockResolvedValue(rows);

      const result = await resolver.dealVelocity();

      expect(mockDashboardService.getDealVelocity).toHaveBeenCalledWith(undefined, undefined);
      expect(result).toEqual(rows);
    });

    it('passes parsed Date objects when range is provided', async () => {
      mockDashboardService.getDealVelocity.mockResolvedValue(rows);

      const from = '2026-01-01T00:00:00.000Z';
      const to = '2026-03-31T23:59:59.999Z';
      await resolver.dealVelocity({ from, to });

      expect(mockDashboardService.getDealVelocity).toHaveBeenCalledWith(new Date(from), new Date(to));
    });

    it('propagates error when service throws', async () => {
      mockDashboardService.getDealVelocity.mockRejectedValue(new Error('DB error'));
      await expect(resolver.dealVelocity()).rejects.toThrow('DB error');
    });
  });

  describe('staleQuotations', () => {
    const pipeline = { thresholdDays: 14, totalCount: 72, totalValue: 2534830.77, items: [] };

    it('passes the threshold through to the service', async () => {
      mockDashboardService.getStaleQuotations.mockResolvedValue(pipeline);

      const result = await resolver.staleQuotations(21);

      expect(mockDashboardService.getStaleQuotations).toHaveBeenCalledWith(21);
      expect(result).toEqual(pipeline);
    });

    it('propagates error when service throws', async () => {
      mockDashboardService.getStaleQuotations.mockRejectedValue(new Error('DB error'));
      await expect(resolver.staleQuotations(14)).rejects.toThrow('DB error');
    });
  });

  describe('quarterlyHistory', () => {
    it('passes the quarter count through to the service', async () => {
      const quarters = [{ quarter: 'Q3 2026', isCurrent: true }];
      mockDashboardService.getQuarterlyHistory.mockResolvedValue(quarters);

      const result = await resolver.quarterlyHistory(4);

      expect(mockDashboardService.getQuarterlyHistory).toHaveBeenCalledWith(4);
      expect(result).toEqual(quarters);
    });

    it('propagates error when service throws', async () => {
      mockDashboardService.getQuarterlyHistory.mockRejectedValue(new Error('DB error'));
      await expect(resolver.quarterlyHistory(4)).rejects.toThrow('DB error');
    });
  });

  describe('repDealSizeWinRates', () => {
    const heatmap = { buckets: ['<5k', '5k–20k', '>20k'], teamAverage: [], reps: [], totalReps: 0, offset: 0, limit: 10 };

    it('passes the range and paging through to the service', async () => {
      mockDashboardService.getRepDealSizeWinRates.mockResolvedValue(heatmap);

      const result = await resolver.repDealSizeWinRates({ from: '2026-01-01T00:00:00.000Z' }, 10, 10);

      expect(mockDashboardService.getRepDealSizeWinRates).toHaveBeenCalledWith(
        new Date('2026-01-01T00:00:00.000Z'),
        undefined,
        10,
        10,
      );
      expect(result).toEqual(heatmap);
    });

    it('defaults to the first page of 10 for all time', async () => {
      mockDashboardService.getRepDealSizeWinRates.mockResolvedValue(heatmap);
      await resolver.repDealSizeWinRates();
      expect(mockDashboardService.getRepDealSizeWinRates).toHaveBeenCalledWith(undefined, undefined, 0, 10);
    });

    it('propagates error when service throws', async () => {
      mockDashboardService.getRepDealSizeWinRates.mockRejectedValue(new Error('DB error'));
      await expect(resolver.repDealSizeWinRates()).rejects.toThrow('DB error');
    });
  });
});

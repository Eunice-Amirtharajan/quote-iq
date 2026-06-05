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

    // Default mock responses
    mockPrismaService.quotation.count.mockResolvedValue(0);
    mockPrismaService.quotation.aggregate.mockResolvedValue({
      _sum: { total: null },
    });
  });

  afterEach(() => jest.clearAllMocks());

  describe('getStats', () => {
    it('returns zero stats when no quotations exist', async () => {
      const result = await service.getStats(mockUser(Role.SALES_MANAGER));

      expect(result).toEqual({
        totalQuotations: 0,
        totalSent: 0,
        totalApproved: 0,
        totalRejected: 0,
        conversionRate: 0,
        totalPipelineValue: 0,
        totalApprovedValue: 0,
      });
    });

    it('uses empty where clause for SALES_MANAGER', async () => {
      await service.getStats(mockUser(Role.SALES_MANAGER));

      expect(mockPrismaService.quotation.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it('uses empty where clause for ADMIN', async () => {
      await service.getStats(mockUser(Role.ADMIN));

      expect(mockPrismaService.quotation.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it('filters by createdById for SALES_REP', async () => {
      await service.getStats(mockUser(Role.SALES_REP));

      expect(mockPrismaService.quotation.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { createdById: 'user-1' },
        }),
      );
    });

    it('calculates conversion rate correctly', async () => {
      // 3 approved out of (3+4)=7 decided = 42.9%
      mockPrismaService.quotation.count
        .mockResolvedValueOnce(10) // totalQuotations
        .mockResolvedValueOnce(2) // totalSent
        .mockResolvedValueOnce(3) // totalApproved
        .mockResolvedValueOnce(4); // totalRejected

      const result = await service.getStats(mockUser(Role.SALES_MANAGER));

      expect(result.conversionRate).toBe(42.9);
    });

    it('returns zero conversion rate when no quotations', async () => {
      mockPrismaService.quotation.count.mockResolvedValue(0);

      const result = await service.getStats(mockUser(Role.SALES_MANAGER));

      expect(result.conversionRate).toBe(0);
    });

    it('returns pipeline and approved values from aggregation', async () => {
      mockPrismaService.quotation.count.mockResolvedValue(5);
      mockPrismaService.quotation.aggregate
        .mockResolvedValueOnce({ _sum: { total: 50000 } }) // pipeline
        .mockResolvedValueOnce({ _sum: { total: 30000 } }); // approved

      const result = await service.getStats(mockUser(Role.SALES_MANAGER));

      expect(result.totalPipelineValue).toBe(50000);
      expect(result.totalApprovedValue).toBe(30000);
    });

    it('handles null aggregate sum gracefully', async () => {
      mockPrismaService.quotation.count.mockResolvedValue(0);
      mockPrismaService.quotation.aggregate.mockResolvedValue({
        _sum: { total: null },
      });

      const result = await service.getStats(mockUser(Role.SALES_MANAGER));

      expect(result.totalPipelineValue).toBe(0);
      expect(result.totalApprovedValue).toBe(0);
    });

    it('throws and logs error when prisma fails', async () => {
      mockPrismaService.quotation.count.mockRejectedValue(
        new Error('DB error'),
      );

      await expect(
        service.getStats(mockUser(Role.SALES_MANAGER)),
      ).rejects.toThrow('DB error');

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});

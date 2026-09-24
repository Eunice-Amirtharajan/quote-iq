import { Test, TestingModule } from '@nestjs/testing';
import { DashboardResolver } from './dashboard.resolver';
import { DashboardService } from './dashboard.service';
import { Role } from '@prisma/client';
import type { User } from '@prisma/client';

const mockDashboardService = {
  getStats: jest.fn(),
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
});

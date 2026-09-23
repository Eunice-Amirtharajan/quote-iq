import { Test, TestingModule } from '@nestjs/testing';
import { QuotationsResolver } from './quotations.resolver';
import { QuotationsService } from './quotations.service';
import { Role, QuotationStatus } from '@prisma/client';
import type { User } from '@prisma/client';
import { UserType } from '../users/user.entity';

const mockQuotationsService = {
  findAll: jest.fn(),
  findOwner: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  updateStatus: jest.fn(),
  delete: jest.fn(),
  findStatusHistory: jest.fn(),
};

const mockUser: User = {
  id: 'user-1',
  email: 'anna@quoteiq.com',
  name: 'Anna Schmidt',
  password: 'hash',
  role: Role.SALES_REP,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockQuotation = {
  id: 'q-1',
  quotationNumber: 'QT-2026-0001',
  title: 'Enterprise License',
  client: { id: 'c-1', name: 'Hans Bauer' },
  status: QuotationStatus.DRAFT,
  total: 7140,
  createdById: 'user-1',
};

describe('QuotationsResolver', () => {
  let resolver: QuotationsResolver;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotationsResolver,
        { provide: QuotationsService, useValue: mockQuotationsService },
        {
          provide: 'PROM_METRIC_GRAPHQL_RESOLVER_DURATION_SECONDS',
          useValue: { startTimer: jest.fn().mockReturnValue(jest.fn()) },
        },
      ],
    }).compile();

    resolver = module.get<QuotationsResolver>(QuotationsResolver);
  });

  afterEach(() => jest.clearAllMocks());

  describe('quotations', () => {
    it('returns all quotations for current user', async () => {
      mockQuotationsService.findAll.mockResolvedValue([mockQuotation]);
      const result = await resolver.quotations(mockUser);
      expect(mockQuotationsService.findAll).toHaveBeenCalledWith(
        mockUser,
        undefined,
        undefined,
        undefined,
      );
      expect(result).toEqual([mockQuotation]);
    });

    it('forwards take, skip, and filter to service', async () => {
      const filter = { status: QuotationStatus.DRAFT, search: 'enterprise' };
      mockQuotationsService.findAll.mockResolvedValue([mockQuotation]);
      await resolver.quotations(mockUser, 5, 10, filter);
      expect(mockQuotationsService.findAll).toHaveBeenCalledWith(
        mockUser,
        5,
        10,
        filter,
      );
    });
  });

  describe('quotation', () => {
    it('returns quotation by id for SALES_REP who owns it', async () => {
      mockQuotationsService.findOne.mockResolvedValue(mockQuotation);
      const result = await resolver.quotation('q-1', mockUser);
      expect(mockQuotationsService.findOwner).not.toHaveBeenCalled();
      expect(mockQuotationsService.findOne).toHaveBeenCalledWith('q-1');
      expect(result).toEqual(mockQuotation);
    });

    it('returns null when not found for SALES_REP', async () => {
      mockQuotationsService.findOne.mockResolvedValue(null);
      const result = await resolver.quotation('q-999', mockUser);
      expect(result).toBeNull();
      expect(mockQuotationsService.findOwner).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when SALES_REP accesses another rep quotation', async () => {
      mockQuotationsService.findOne.mockResolvedValue({
        ...mockQuotation,
        createdById: 'user-999',
      });
      await expect(
        resolver.quotation('q-1', mockUser as UserType),
      ).rejects.toThrow('Forbidden');
      expect(mockQuotationsService.findOwner).not.toHaveBeenCalled();
    });

    it('fetches full record directly for SALES_MANAGER without owner check', async () => {
      const manager = { ...mockUser, role: Role.SALES_MANAGER };
      mockQuotationsService.findOne.mockResolvedValue(mockQuotation);
      const result = await resolver.quotation('q-1', manager);
      expect(mockQuotationsService.findOwner).not.toHaveBeenCalled();
      expect(result).toEqual(mockQuotation);
    });

    it('returns null from findOne when quotation not found for SALES_MANAGER', async () => {
      const manager = { ...mockUser, role: Role.SALES_MANAGER };
      mockQuotationsService.findOne.mockResolvedValue(null);
      const result = await resolver.quotation('q-999', manager);
      expect(result).toBeNull();
    });
  });

  describe('createQuotation', () => {
    it('creates and returns quotation', async () => {
      const input = {
        title: 'New Quote',
        clientId: 'c-1',
        taxRate: 19,
        items: [],
      };
      mockQuotationsService.create.mockResolvedValue(mockQuotation);

      const result = await resolver.createQuotation(input, mockUser);

      expect(mockQuotationsService.create).toHaveBeenCalledWith(
        input,
        mockUser,
      );
      expect(result).toEqual(mockQuotation);
    });

    it('allows SALES_MANAGER to create quotation', async () => {
      const manager = { ...mockUser, role: Role.SALES_MANAGER };
      const input = {
        title: 'Manager Quote',
        clientId: 'c-2',
        taxRate: 0,
        items: [],
      };
      mockQuotationsService.create.mockResolvedValue(mockQuotation);

      const result = await resolver.createQuotation(input, manager);
      expect(mockQuotationsService.create).toHaveBeenCalledWith(input, manager);
      expect(result).toEqual(mockQuotation);
    });
  });

  describe('updateQuotationStatus', () => {
    it('updates status for SALES_REP who owns the quotation', async () => {
      mockQuotationsService.findOwner.mockResolvedValue({
        createdById: 'user-1',
      });
      mockQuotationsService.updateStatus.mockResolvedValue({
        ...mockQuotation,
        status: QuotationStatus.SENT,
      });

      const result = await resolver.updateQuotationStatus(
        'q-1',
        { status: 'SENT', note: 'Sending' },
        mockUser,
      );

      expect(mockQuotationsService.findOwner).toHaveBeenCalledWith('q-1');
      expect(mockQuotationsService.findOne).not.toHaveBeenCalled();
      expect(mockQuotationsService.updateStatus).toHaveBeenCalledWith(
        'q-1',
        'SENT',
        'Sending',
        'user-1',
        Role.SALES_REP,
      );
      expect(result).toMatchObject({ status: QuotationStatus.SENT });
    });

    it('throws NotFoundException when quotation not found for SALES_REP', async () => {
      mockQuotationsService.findOwner.mockResolvedValue(null);
      await expect(
        resolver.updateQuotationStatus(
          'q-999',
          { status: 'SENT', note: undefined },
          mockUser,
        ),
      ).rejects.toThrow('Quotation q-999 not found');
      expect(mockQuotationsService.updateStatus).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when SALES_REP updates another rep quotation', async () => {
      mockQuotationsService.findOwner.mockResolvedValue({
        createdById: 'user-999',
      });
      await expect(
        resolver.updateQuotationStatus(
          'q-1',
          { status: 'SENT', note: undefined },
          mockUser,
        ),
      ).rejects.toThrow('Forbidden');
      expect(mockQuotationsService.updateStatus).not.toHaveBeenCalled();
    });

    it('updates status for SALES_MANAGER without owner check', async () => {
      const manager = { ...mockUser, role: Role.SALES_MANAGER };
      mockQuotationsService.updateStatus.mockResolvedValue({
        ...mockQuotation,
        status: QuotationStatus.APPROVED,
      });

      const result = await resolver.updateQuotationStatus(
        'q-1',
        { status: 'APPROVED', note: 'Looks good' },
        manager,
      );

      expect(mockQuotationsService.findOwner).not.toHaveBeenCalled();
      expect(mockQuotationsService.updateStatus).toHaveBeenCalledWith(
        'q-1',
        'APPROVED',
        'Looks good',
        'user-1',
        Role.SALES_MANAGER,
      );
      expect(result).toMatchObject({ status: QuotationStatus.APPROVED });
    });
  });

  describe('deleteQuotation', () => {
    it('passes id and userId to service and returns true', async () => {
      mockQuotationsService.delete.mockResolvedValue(true);
      const result = await resolver.deleteQuotation(
        'q-1',
        mockUser as UserType,
      );
      expect(mockQuotationsService.delete).toHaveBeenCalledWith(
        'q-1',
        'user-1',
      );
      expect(result).toBe(true);
    });
  });

  describe('updateQuotation', () => {
    it('delegates to service with id, input, and userId', async () => {
      const updated = { ...mockQuotation, title: 'Revised' };
      mockQuotationsService.update.mockResolvedValue(updated);
      const result = await resolver.updateQuotation(
        'q-1',
        { title: 'Revised', version: 2 },
        mockUser as UserType,
      );
      expect(mockQuotationsService.update).toHaveBeenCalledWith(
        'q-1',
        { title: 'Revised', version: 2 },
        'user-1',
      );
      expect(result).toEqual(updated);
    });
  });

  describe('statusHistory', () => {
    const mockHistory = [
      {
        id: 'sh-1',
        fromStatus: QuotationStatus.DRAFT,
        toStatus: QuotationStatus.SENT,
        note: null,
        changedAt: new Date('2026-01-01'),
        changedBy: { name: 'Anna Schmidt' },
      },
    ];

    it('delegates to service with quotationId, userId, and role', async () => {
      mockQuotationsService.findStatusHistory.mockResolvedValue(mockHistory);
      const result = await resolver.statusHistory('q-1', mockUser as UserType);
      expect(mockQuotationsService.findStatusHistory).toHaveBeenCalledWith(
        'q-1',
        'user-1',
        Role.SALES_REP,
      );
      expect(result).toEqual(mockHistory);
    });
  });
});

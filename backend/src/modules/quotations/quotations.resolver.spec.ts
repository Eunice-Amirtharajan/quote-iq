import { Test, TestingModule } from '@nestjs/testing';
import { QuotationsResolver } from './quotations.resolver';
import { QuotationsService } from './quotations.service';
import { ClientsService } from '../clients/clients.service';
import { Role, QuotationStatus } from '@prisma/client';
import type { User } from '@prisma/client';
import { UserType } from '../users/user.entity';

const mockQuotationsService = {
  findAll: jest.fn(),
  findOwner: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  updateStatus: jest.fn(),
  delete: jest.fn(),
};

const mockClientsService = {
  findOwner: jest.fn(),
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
        { provide: ClientsService, useValue: mockClientsService },
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
      );
      expect(result).toEqual([mockQuotation]);
    });
  });

  describe('quotation', () => {
    it('returns quotation by id for SALES_REP who owns it', async () => {
      mockQuotationsService.findOwner.mockResolvedValue({
        createdById: 'user-1',
      });
      mockQuotationsService.findOne.mockResolvedValue(mockQuotation);
      const result = await resolver.quotation('q-1', mockUser);
      expect(mockQuotationsService.findOwner).toHaveBeenCalledWith('q-1');
      expect(result).toEqual(mockQuotation);
    });

    it('returns null when not found for SALES_REP', async () => {
      mockQuotationsService.findOwner.mockResolvedValue(null);
      const result = await resolver.quotation('q-999', mockUser);
      expect(result).toBeNull();
      expect(mockQuotationsService.findOne).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when SALES_REP accesses another rep quotation', async () => {
      mockQuotationsService.findOwner.mockResolvedValue({
        createdById: 'user-999',
      });
      await expect(
        resolver.quotation('q-1', mockUser as UserType),
      ).rejects.toThrow('Forbidden');
      expect(mockQuotationsService.findOne).not.toHaveBeenCalled();
    });

    it('fetches full record directly for SALES_MANAGER without owner check', async () => {
      const manager = { ...mockUser, role: Role.SALES_MANAGER };
      mockQuotationsService.findOne.mockResolvedValue(mockQuotation);
      const result = await resolver.quotation('q-1', manager);
      expect(mockQuotationsService.findOwner).not.toHaveBeenCalled();
      expect(result).toEqual(mockQuotation);
    });
  });

  describe('createQuotation', () => {
    it('creates and returns quotation for owner of client', async () => {
      const input = {
        title: 'New Quote',
        clientId: 'c-1',
        taxRate: 19,
        items: [],
      };
      mockClientsService.findOwner.mockResolvedValue({ createdById: 'user-1' });
      mockQuotationsService.create.mockResolvedValue(mockQuotation);

      const result = await resolver.createQuotation(input, mockUser);

      expect(mockQuotationsService.create).toHaveBeenCalledWith(
        input,
        mockUser,
      );
      expect(result).toEqual(mockQuotation);
    });

    it('throws NotFoundException when client not found', async () => {
      mockClientsService.findOwner.mockResolvedValue(null);
      await expect(
        resolver.createQuotation(
          { title: 'Q', clientId: 'c-999', taxRate: 0, items: [] },
          mockUser,
        ),
      ).rejects.toThrow('Client c-999 not found');
      expect(mockQuotationsService.create).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when client belongs to another rep', async () => {
      mockClientsService.findOwner.mockResolvedValue({
        createdById: 'user-999',
      });
      await expect(
        resolver.createQuotation(
          { title: 'Q', clientId: 'c-1', taxRate: 0, items: [] },
          mockUser,
        ),
      ).rejects.toThrow('Forbidden');
      expect(mockQuotationsService.create).not.toHaveBeenCalled();
    });

    it('allows ADMIN to create quotation for any client', async () => {
      const admin = { ...mockUser, role: Role.ADMIN };
      const input = {
        title: 'Admin Quote',
        clientId: 'c-other',
        taxRate: 0,
        items: [],
      };
      mockClientsService.findOwner.mockResolvedValue({
        createdById: 'user-999',
      });
      mockQuotationsService.create.mockResolvedValue(mockQuotation);

      const result = await resolver.createQuotation(input, admin);
      expect(mockQuotationsService.create).toHaveBeenCalledWith(input, admin);
      expect(result).toEqual(mockQuotation);
    });

    it('allows SALES_MANAGER to create quotation for any client', async () => {
      const manager = { ...mockUser, role: Role.SALES_MANAGER };
      const input = {
        title: 'Manager Quote',
        clientId: 'c-other',
        taxRate: 0,
        items: [],
      };
      mockClientsService.findOwner.mockResolvedValue({
        createdById: 'user-999',
      });
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
    it('deletes and returns true', async () => {
      mockQuotationsService.delete.mockResolvedValue(true);
      const result = await resolver.deleteQuotation('q-1');
      expect(mockQuotationsService.delete).toHaveBeenCalledWith('q-1');
      expect(result).toBe(true);
    });
  });
});

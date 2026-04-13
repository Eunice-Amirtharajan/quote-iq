import { Test, TestingModule } from '@nestjs/testing';
import { QuotationsResolver } from './quotations.resolver';
import { QuotationsService } from './quotations.service';
import { Role, QuotationStatus } from '@prisma/client';
import type { User } from '@prisma/client';
import { UserType } from '../users/user.entity';
import {
  CreateQuotationInput,
  UpdateQuotationStatusInput,
} from './dto/quotation.input';

const mockQuotationsService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  updateStatus: jest.fn(),
  delete: jest.fn(),
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
};

describe('QuotationsResolver', () => {
  let resolver: QuotationsResolver;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotationsResolver,
        { provide: QuotationsService, useValue: mockQuotationsService },
      ],
    }).compile();

    resolver = module.get<QuotationsResolver>(QuotationsResolver);
  });

  afterEach(() => jest.clearAllMocks());

  describe('quotations', () => {
    it('returns all quotations for current user', async () => {
      mockQuotationsService.findAll.mockResolvedValue([mockQuotation]);
      const result = await resolver.quotations(mockUser as UserType);
      expect(mockQuotationsService.findAll).toHaveBeenCalledWith(mockUser);
      expect(result).toEqual([mockQuotation]);
    });
  });

  describe('quotation', () => {
    it('returns quotation by id', async () => {
      mockQuotationsService.findOne.mockResolvedValue(mockQuotation);
      const result = await resolver.quotation('q-1');
      expect(result).toEqual(mockQuotation);
    });

    it('returns null when not found', async () => {
      mockQuotationsService.findOne.mockResolvedValue(null);
      const result = await resolver.quotation('q-999');
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

      const result = await resolver.createQuotation(
        input as CreateQuotationInput,
        mockUser as UserType,
      );

      expect(mockQuotationsService.create).toHaveBeenCalledWith(
        input,
        mockUser,
      );
      expect(result).toEqual(mockQuotation);
    });
  });

  describe('updateQuotationStatus', () => {
    it('updates status when quotation exists', async () => {
      mockQuotationsService.findOne.mockResolvedValue(mockQuotation);
      mockQuotationsService.updateStatus.mockResolvedValue({
        ...mockQuotation,
        status: QuotationStatus.SENT,
      });

      const result = await resolver.updateQuotationStatus(
        'q-1',
        { status: 'SENT', note: 'Sending' } as UpdateQuotationStatusInput,
        mockUser as UserType,
      );

      expect(mockQuotationsService.updateStatus).toHaveBeenCalledWith(
        'q-1',
        'SENT',
        'Sending',
        'user-1',
      );
      expect(result).toMatchObject({ status: QuotationStatus.SENT });
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

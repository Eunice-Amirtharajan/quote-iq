import { Test, TestingModule } from '@nestjs/testing';
import { PublicQuotationsResolver } from './public-quotations.resolver';
import { QuotationsService } from './quotations.service';
import { QuotationStatus } from '@prisma/client';
import type { PublicQuotationType } from './quotation.entity';

const mockQuotationsService = {
  findByToken: jest.fn(),
};

const mockPublicQuotation: PublicQuotationType = {
  quotationNumber: 'QT-2026-0001',
  title: 'Enterprise License',
  clientName: 'Hans Bauer',
  repName: 'Anna Schmidt',
  status: QuotationStatus.SENT,
  notes: null,
  taxRate: 19,
  subtotal: 6000,
  taxAmount: 1140,
  total: 7140,
  items: [
    {
      id: 'item-1',
      quotationId: 'q-1',
      description: 'Software License',
      quantity: 3,
      unitPrice: 2000,
      lineTotal: 6000,
      sortOrder: 1,
    },
  ],
};

describe('PublicQuotationsResolver', () => {
  let resolver: PublicQuotationsResolver;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublicQuotationsResolver,
        { provide: QuotationsService, useValue: mockQuotationsService },
      ],
    }).compile();

    resolver = module.get<PublicQuotationsResolver>(PublicQuotationsResolver);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(resolver).toBeDefined();
  });

  describe('quotationByToken', () => {
    it('returns the quotation when the token matches', async () => {
      mockQuotationsService.findByToken.mockResolvedValue(mockPublicQuotation);

      const result = await resolver.quotationByToken('valid-token-abc');

      expect(mockQuotationsService.findByToken).toHaveBeenCalledWith(
        'valid-token-abc',
      );
      expect(result).toEqual(mockPublicQuotation);
    });

    it('returns null when no quotation matches the token', async () => {
      mockQuotationsService.findByToken.mockResolvedValue(null);

      const result = await resolver.quotationByToken('unknown-token');

      expect(mockQuotationsService.findByToken).toHaveBeenCalledWith(
        'unknown-token',
      );
      expect(result).toBeNull();
    });

    it('propagates errors thrown by the service', async () => {
      mockQuotationsService.findByToken.mockRejectedValue(
        new Error('Database unreachable'),
      );

      await expect(resolver.quotationByToken('any-token')).rejects.toThrow(
        'Database unreachable',
      );
    });

    it('calls findByToken with exactly the token argument passed', async () => {
      mockQuotationsService.findByToken.mockResolvedValue(null);
      const token = 'abc123xyz';

      await resolver.quotationByToken(token);

      expect(mockQuotationsService.findByToken).toHaveBeenCalledTimes(1);
      expect(mockQuotationsService.findByToken).toHaveBeenCalledWith(token);
    });
  });
});

// Mock the Google Generative AI module
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn().mockResolvedValue({
        response: {
          text: jest.fn().mockReturnValue(
            JSON.stringify({
              summary: 'Test summary',
              recommendation: 'PROCEED',
              keyPoints: ['Point 1', 'Point 2'],
              riskFactors: ['Risk 1'],
            }),
          ),
        },
      }),
    }),
  })),
}));

// Mock fetch for model resolution
global.fetch = jest.fn().mockResolvedValue({
  json: jest.fn().mockResolvedValue({
    models: [
      {
        name: 'models/gemini-2.5-flash',
        supportedGenerationMethods: ['generateContent'],
      },
    ],
  }),
}) as unknown as typeof fetch;

const mockPrismaService = {
  quotation: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};
import { Test, TestingModule } from '@nestjs/testing';
import { AIService } from './ai.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AppLogger } from '../../common/logger/logger.service';
import { Recommendation } from './ai-insight.entity';
const mockQuotation = {
  id: 'q-1',
  quotationNumber: 'QT-2026-0001',
  title: 'Enterprise License',
  status: 'DRAFT',
  total: 7140,
  subtotal: 6000,
  taxAmount: 1140,
  taxRate: 19,
  notes: null,
  validUntil: null,
  clientId: 'c-1',
  createdAt: new Date(),
  items: [
    {
      description: 'Software License',
      quantity: 1,
      unitPrice: 5000,
      lineTotal: 5000,
    },
  ],
  client: { name: 'Hans Bauer', company: 'Bauer GmbH' },
  createdBy: { name: 'Anna Schmidt', email: 'anna@quoteiq.com' },
};

describe('AIService', () => {
  let service: AIService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AppLogger, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<AIService>(AIService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('generateQuotationSummary', () => {
    it('returns structured summary for valid quotation', async () => {
      mockPrismaService.quotation.findUnique.mockResolvedValue(mockQuotation);
      mockPrismaService.quotation.findMany.mockResolvedValue([]);

      const result = await service.generateQuotationSummary('q-1');

      expect(result.summary).toBe('Test summary');
      expect(result.recommendation).toBe(Recommendation.PROCEED);
      expect(result.keyPoints).toEqual(['Point 1', 'Point 2']);
      expect(result.riskFactors).toEqual(['Risk 1']);
    });

    it('throws when quotation not found', async () => {
      mockPrismaService.quotation.findUnique.mockResolvedValue(null);

      await expect(service.generateQuotationSummary('q-999')).rejects.toThrow(
        'Quotation q-999 not found',
      );
    });

    it('logs warning when quotation not found', async () => {
      mockPrismaService.quotation.findUnique.mockResolvedValue(null);

      await expect(service.generateQuotationSummary('q-999')).rejects.toThrow();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('q-999'),
        AIService.name,
      );
    });

    it('includes client history in prompt context', async () => {
      const clientHistory = [
        { ...mockQuotation, id: 'q-old-1', status: 'APPROVED', total: 5000 },
        { ...mockQuotation, id: 'q-old-2', status: 'REJECTED', total: 8000 },
      ];

      mockPrismaService.quotation.findUnique.mockResolvedValue(mockQuotation);
      mockPrismaService.quotation.findMany.mockResolvedValue(clientHistory);

      const result = await service.generateQuotationSummary('q-1');

      expect(result).toBeDefined();
      expect(mockPrismaService.quotation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ clientId: 'c-1' }),
        }),
      );
    });

    it('throws and logs error when Gemini fails', async () => {
      mockPrismaService.quotation.findUnique.mockResolvedValue(mockQuotation);
      mockPrismaService.quotation.findMany.mockResolvedValue([]);

      // Override the generateContent mock to throw
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      (GoogleGenerativeAI as jest.Mock).mockImplementationOnce(() => ({
        getGenerativeModel: jest.fn().mockReturnValue({
          generateContent: jest
            .fn()
            .mockRejectedValue(new Error('Gemini error')),
        }),
      }));

      // Recreate service with failing mock
      const module = await Test.createTestingModule({
        providers: [
          AIService,
          { provide: PrismaService, useValue: mockPrismaService },
          { provide: AppLogger, useValue: mockLogger },
        ],
      }).compile();

      const failingService = module.get<AIService>(AIService);

      await expect(
        failingService.generateQuotationSummary('q-1'),
      ).rejects.toThrow('Gemini error');

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});

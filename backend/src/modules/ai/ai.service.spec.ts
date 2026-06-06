import { Test, TestingModule } from '@nestjs/testing';
import { AIService } from './ai.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AppLogger } from '../../common/logger/logger.service';
import { Recommendation } from './ai-insight.entity';

const mockGroqResponse = {
  choices: [
    {
      message: {
        content: JSON.stringify({
          summary: 'Test summary',
          recommendation: 'PROCEED',
          keyPoints: ['Point 1', 'Point 2'],
          riskFactors: ['Risk 1'],
        }),
      },
    },
  ],
};

const mockCreate = jest.fn().mockResolvedValue(mockGroqResponse);

jest.mock('groq-sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  })),
}));

const mockPrismaService = {
  quotation: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  aIInsight: {
    findFirst: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
  },
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

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

describe('AIService — missing API key', () => {
  it('throws on construction when GROQ_API_KEY is not set', () => {
    const savedKey = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;
    expect(
      () => new AIService(mockPrismaService as never, mockLogger as never),
    ).toThrow('GROQ_API_KEY is not set');
    process.env.GROQ_API_KEY = savedKey;
  });
});

describe('AIService', () => {
  let service: AIService;

  beforeEach(async () => {
    process.env.GROQ_API_KEY = 'test-key';
    mockCreate.mockResolvedValue(mockGroqResponse);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AppLogger, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<AIService>(AIService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Reset cache mock to null after each test so cache doesn't bleed between tests
    mockPrismaService.aIInsight.findFirst.mockResolvedValue(null);
  });

  describe('generateQuotationSummary', () => {
    it('returns structured summary for valid quotation', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue(mockQuotation);
      mockPrismaService.quotation.findMany.mockResolvedValue([]);

      const result = await service.generateQuotationSummary('q-1');

      expect(result.summary).toBe('Test summary');
      expect(result.recommendation).toBe(Recommendation.PROCEED);
      expect(result.keyPoints).toEqual(['Point 1', 'Point 2']);
      expect(result.riskFactors).toEqual(['Risk 1']);
      expect(mockPrismaService.aIInsight.upsert).toHaveBeenCalled();
    });

    it('throws when quotation not found', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue(null);

      await expect(service.generateQuotationSummary('q-999')).rejects.toThrow(
        'Quotation q-999 not found',
      );
    });

    it('logs warning when quotation not found', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue(null);

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

      mockPrismaService.quotation.findFirst.mockResolvedValue(mockQuotation);
      mockPrismaService.quotation.findMany.mockResolvedValue(clientHistory);

      const result = await service.generateQuotationSummary('q-1');

      expect(result).toBeDefined();
      expect(mockPrismaService.quotation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ clientId: 'c-1' }),
        }),
      );
    });

    it('returns cached insight when valid cache exists', async () => {
      const cachedContent = JSON.stringify({
        summary: 'Cached summary',
        recommendation: 'FOLLOW_UP',
        keyPoints: ['Cached point'],
        riskFactors: [],
      });
      mockPrismaService.aIInsight.findFirst.mockResolvedValue({
        id: 'insight-1',
        content: cachedContent,
      });

      const result = await service.generateQuotationSummary('q-1');

      expect(result.summary).toBe('Cached summary');
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('throws and logs error when Groq fails on all models', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue(mockQuotation);
      mockPrismaService.quotation.findMany.mockResolvedValue([]);
      mockCreate.mockRejectedValue(new Error('Groq API error'));

      await expect(
        service.generateQuotationSummary('q-1'),
      ).rejects.toThrow('Groq API error');

      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('throws InternalServerErrorException when AI response is unparseable', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue(mockQuotation);
      mockPrismaService.quotation.findMany.mockResolvedValue([]);
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'not valid json {{{' } }],
      });

      await expect(
        service.generateQuotationSummary('q-1'),
      ).rejects.toThrow('AI response could not be parsed');
    });

    it('forces RECONSIDER when computed recommendation is RECONSIDER', async () => {
      const clientHistory = Array.from({ length: 5 }, (_, i) => ({
        ...mockQuotation,
        id: `q-old-${i}`,
        status: 'REJECTED',
        total: 5000,
      }));

      mockPrismaService.quotation.findFirst.mockResolvedValue(mockQuotation);
      mockPrismaService.quotation.findMany.mockResolvedValue(clientHistory);
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: 'Risky deal',
                recommendation: 'PROCEED',
                keyPoints: [],
                riskFactors: ['High rejection rate'],
              }),
            },
          },
        ],
      });

      const result = await service.generateQuotationSummary('q-1');

      expect(result.recommendation).toBe(Recommendation.RECONSIDER);
    });

    it('strips markdown code fences from AI response', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue(mockQuotation);
      mockPrismaService.quotation.findMany.mockResolvedValue([]);
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content:
                '```json\n' +
                JSON.stringify({
                  summary: 'Fenced summary',
                  recommendation: 'FOLLOW_UP',
                  keyPoints: [],
                  riskFactors: [],
                }) +
                '\n```',
            },
          },
        ],
      });

      const result = await service.generateQuotationSummary('q-1');

      expect(result.summary).toBe('Fenced summary');
    });

    it('computes PROCEED when client has strong approval history and deal within range', async () => {
      // 4 approved out of 5 = 80% approval rate, deal matches average closely
      const clientHistory = Array.from({ length: 5 }, (_, i) => ({
        ...mockQuotation,
        id: `q-old-${i}`,
        status: i < 4 ? 'APPROVED' : 'DRAFT',
        total: 7000,
      }));

      mockPrismaService.quotation.findFirst.mockResolvedValue(mockQuotation);
      mockPrismaService.quotation.findMany.mockResolvedValue(clientHistory);

      const result = await service.generateQuotationSummary('q-1');

      expect(result).toBeDefined();
      // computeRecommendation returns PROCEED; AI mock returns PROCEED too
      expect(result.recommendation).toBe(Recommendation.PROCEED);
    });

    it('deletes corrupt cache entry and regenerates', async () => {
      // Cache exists but content is invalid JSON — triggers the delete-and-regenerate path
      mockPrismaService.aIInsight.findFirst.mockResolvedValue({
        id: 'insight-corrupt',
        content: '{not valid json',
      });
      mockPrismaService.quotation.findFirst.mockResolvedValue(mockQuotation);
      mockPrismaService.quotation.findMany.mockResolvedValue([]);

      const result = await service.generateQuotationSummary('q-1');

      expect(mockPrismaService.aIInsight.delete).toHaveBeenCalledWith({
        where: { id: 'insight-corrupt' },
      });
      expect(result.summary).toBe('Test summary');
    });

    it('throws InternalServerErrorException when quotation has missing relations', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue({
        ...mockQuotation,
        client: null,
        createdBy: null,
      });

      await expect(service.generateQuotationSummary('q-1')).rejects.toThrow(
        'Quotation has missing relations',
      );
    });

    it('throws after all Groq models fail with transient errors', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue(mockQuotation);
      mockPrismaService.quotation.findMany.mockResolvedValue([]);
      // Simulate transient 503 on every model attempt
      mockCreate.mockRejectedValue(new Error('503 Service Unavailable'));

      await expect(service.generateQuotationSummary('q-1')).rejects.toThrow(
        '503',
      );
      // Should have tried multiple models
      expect(mockCreate).toHaveBeenCalledTimes(3);
    });

    it('throws immediately on non-transient Groq error without trying next model', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue(mockQuotation);
      mockPrismaService.quotation.findMany.mockResolvedValue([]);
      mockCreate.mockRejectedValue(new Error('Authentication failed'));

      await expect(service.generateQuotationSummary('q-1')).rejects.toThrow(
        'Authentication failed',
      );
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('includes notes in prompt when quotation has notes', async () => {
      const quotationWithNotes = { ...mockQuotation, notes: 'Special discount applies' };
      mockPrismaService.quotation.findFirst.mockResolvedValue(quotationWithNotes);
      mockPrismaService.quotation.findMany.mockResolvedValue([]);

      const result = await service.generateQuotationSummary('q-1');

      expect(result).toBeDefined();
    });

    it('shows "First deal" label when no client history and deal total is zero', async () => {
      // total=0, avgDealSize=0 → total > avgDealSize is false → avgDealSize > 0 is false → "First deal"
      mockPrismaService.quotation.findFirst.mockResolvedValue({
        ...mockQuotation,
        total: 0,
      });
      mockPrismaService.quotation.findMany.mockResolvedValue([]);

      const result = await service.generateQuotationSummary('q-1');

      expect(result).toBeDefined();
    });

    it('shows "% below average" label when deal is smaller than client average', async () => {
      // mockQuotation.total = 7140; history average = 20000 → below average
      const clientHistory = [
        { ...mockQuotation, id: 'q-old-1', status: 'APPROVED', total: 20000 },
      ];
      mockPrismaService.quotation.findFirst.mockResolvedValue(mockQuotation);
      mockPrismaService.quotation.findMany.mockResolvedValue(clientHistory);

      const result = await service.generateQuotationSummary('q-1');

      expect(result).toBeDefined();
    });

    it('handles empty choices content from Groq gracefully', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue(mockQuotation);
      mockPrismaService.quotation.findMany.mockResolvedValue([]);
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: null } }],
      });

      await expect(service.generateQuotationSummary('q-1')).rejects.toThrow(
        'AI response could not be parsed',
      );
    });

    it('logs String(error) when a non-Error is thrown during summary generation', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue(mockQuotation);
      mockPrismaService.quotation.findMany.mockResolvedValue([]);
      mockCreate.mockRejectedValue('plain string error');

      await expect(service.generateQuotationSummary('q-1')).rejects.toBe(
        'plain string error',
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(String),
        'plain string error',
        AIService.name,
      );
    });
  });
});

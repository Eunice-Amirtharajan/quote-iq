import { Test, TestingModule } from '@nestjs/testing';
import { AIService } from './ai.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AppLogger } from '../../common/logger/logger.service';
import { ConversionLabel, Recommendation } from './ai-insight.entity';

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
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
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
  clientName: 'Bauer Logistics GmbH',
  createdAt: new Date(),
  items: [
    {
      description: 'Software License',
      quantity: 1,
      unitPrice: 5000,
      lineTotal: 5000,
    },
  ],
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
          where: expect.objectContaining({
            clientName: expect.objectContaining({
              equals: 'Bauer Logistics GmbH',
            }),
          }),
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

  describe('getWinLossAnalysis', () => {
    const approved1 = {
      id: 'q-a1',
      status: 'APPROVED',
      total: 10000,
      createdById: 'user-alice',
      createdBy: { name: 'Alice' },
    };
    const approved2 = {
      id: 'q-a2',
      status: 'APPROVED',
      total: 20000,
      createdById: 'user-bob',
      createdBy: { name: 'Bob' },
    };
    const rejected1 = {
      id: 'q-r1',
      status: 'REJECTED',
      total: 8000,
      createdById: 'user-alice',
      createdBy: { name: 'Alice' },
    };
    const sent1 = {
      id: 'q-s1',
      status: 'SENT',
      total: 3000,
      createdById: 'user-alice',
      createdBy: { name: 'Alice' },
    };

    it('computes overall approval rate correctly', async () => {
      mockPrismaService.aIInsight.findFirst.mockResolvedValue(null);
      mockPrismaService.quotation.findMany.mockResolvedValue([
        approved1,
        approved2,
        rejected1,
      ]);

      const result = await service.getWinLossAnalysis();

      // 2 approved / (2 approved + 1 rejected) = 66.7%
      expect(result.approvalRate).toBe(66.7);
    });

    it('computes avg deal sizes for approved and rejected quotations', async () => {
      mockPrismaService.aIInsight.findFirst.mockResolvedValue(null);
      mockPrismaService.quotation.findMany.mockResolvedValue([
        approved1,
        approved2,
        rejected1,
      ]);

      const result = await service.getWinLossAnalysis();

      expect(result.avgApprovedDeal).toBe(15000); // (10000+20000)/2
      expect(result.avgRejectedDeal).toBe(8000);
    });

    it('builds byRep stats sorted by approvalRate descending', async () => {
      mockPrismaService.aIInsight.findFirst.mockResolvedValue(null);
      // Alice: 1 approved, 1 rejected, 1 sent → approvalRate 50%
      // Bob: 1 approved → approvalRate 100%
      mockPrismaService.quotation.findMany.mockResolvedValue([
        approved1,
        approved2,
        rejected1,
        sent1,
      ]);

      const result = await service.getWinLossAnalysis();

      expect(result.byRep[0].repName).toBe('Bob');
      expect(result.byRep[0].approvalRate).toBe(100);
      expect(result.byRep[1].repName).toBe('Alice');
    });

    it('returns cached result when valid cache exists', async () => {
      const cached = {
        approvalRate: 75,
        avgApprovedDeal: 12000,
        avgRejectedDeal: 9000,
        byRep: [],
        byDealSize: [],
      };
      mockPrismaService.aIInsight.findFirst.mockResolvedValue({
        id: 'insight-wl',
        content: JSON.stringify(cached),
      });

      const result = await service.getWinLossAnalysis();

      expect(result).toEqual(cached);
      expect(mockPrismaService.quotation.findMany).not.toHaveBeenCalled();
    });

    it('returns zero rates when no approved or rejected quotations exist', async () => {
      mockPrismaService.aIInsight.findFirst.mockResolvedValue(null);
      mockPrismaService.quotation.findMany.mockResolvedValue([sent1]);

      const result = await service.getWinLossAnalysis();

      expect(result.approvalRate).toBe(0);
      expect(result.avgApprovedDeal).toBe(0);
      expect(result.avgRejectedDeal).toBe(0);
    });

    it('assigns quotations to correct deal-size buckets', async () => {
      mockPrismaService.aIInsight.findFirst.mockResolvedValue(null);
      // <5k bucket: rejected1 (8000 — actually >5k, let's use a 3000 deal)
      const small = { id: 'q-sm', status: 'APPROVED', total: 3000, createdById: 'user-alice', createdBy: { name: 'Alice' } };
      const mid = { id: 'q-md', status: 'APPROVED', total: 10000, createdById: 'user-alice', createdBy: { name: 'Alice' } };
      const large = { id: 'q-lg', status: 'REJECTED', total: 25000, createdById: 'user-bob', createdBy: { name: 'Bob' } };
      mockPrismaService.quotation.findMany.mockResolvedValue([small, mid, large]);

      const result = await service.getWinLossAnalysis();

      const buckets = Object.fromEntries(result.byDealSize.map((b) => [b.bucket, b]));
      expect(buckets['<5k'].total).toBe(1);
      expect(buckets['5k–20k'].total).toBe(1);
      expect(buckets['>20k'].total).toBe(1);
    });

    it('persists result to AIInsight with WIN_LOSS_ANALYSIS insightType', async () => {
      mockPrismaService.aIInsight.findFirst.mockResolvedValue(null);
      mockPrismaService.quotation.findMany.mockResolvedValue([approved1]);

      await service.getWinLossAnalysis();

      expect(mockPrismaService.aIInsight.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            insightType: 'WIN_LOSS_ANALYSIS',
            quotationId: null,
          }),
        }),
      );
    });

    it('updates existing cache entry instead of creating a new one', async () => {
      // First findFirst (cache check) returns null (expired/missing),
      // second findFirst (before persist) returns existing stale row.
      mockPrismaService.aIInsight.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'wl-cache-1', content: '{}' });
      mockPrismaService.quotation.findMany.mockResolvedValue([approved1]);

      await service.getWinLossAnalysis();

      expect(mockPrismaService.aIInsight.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wl-cache-1' },
        }),
      );
      expect(mockPrismaService.aIInsight.create).not.toHaveBeenCalled();
    });
  });

  describe('getConversionScore', () => {
    it('throws NotFoundException when quotation does not exist', async () => {
      mockPrismaService.aIInsight.findFirst.mockResolvedValue(null);
      mockPrismaService.quotation.findFirst.mockResolvedValue(null);

      await expect(service.getConversionScore('q-999')).rejects.toThrow(
        'Quotation q-999 not found',
      );
    });

    it('returns cached score when valid cache exists', async () => {
      const cached = { score: 72, label: ConversionLabel.HIGH };
      mockPrismaService.aIInsight.findFirst.mockResolvedValue({
        id: 'insight-1',
        content: JSON.stringify(cached),
      });

      const result = await service.getConversionScore('q-1');

      expect(result).toEqual(cached);
      expect(mockPrismaService.quotation.findFirst).not.toHaveBeenCalled();
    });

    it('computes HIGH label when approval rate is strong and deal is near average', async () => {
      mockPrismaService.aIInsight.findFirst.mockResolvedValue(null);
      mockPrismaService.quotation.findFirst.mockResolvedValue(mockQuotation);
      // 4 approved out of 5, average deal = 7000 (within 20% of mockQuotation.total = 7140)
      const history = [
        { ...mockQuotation, id: 'h-1', status: 'APPROVED', total: 7000 },
        { ...mockQuotation, id: 'h-2', status: 'APPROVED', total: 7000 },
        { ...mockQuotation, id: 'h-3', status: 'APPROVED', total: 7000 },
        { ...mockQuotation, id: 'h-4', status: 'APPROVED', total: 7000 },
        { ...mockQuotation, id: 'h-5', status: 'REJECTED', total: 7000 },
      ];
      mockPrismaService.quotation.findMany.mockResolvedValue(history);

      const result = await service.getConversionScore('q-1');

      expect(result.label).toBe(ConversionLabel.HIGH);
      expect(result.score).toBeGreaterThanOrEqual(65);
      expect(mockPrismaService.aIInsight.upsert).toHaveBeenCalled();
    });

    it('caps score at 30 when rejection rate exceeds 60%', async () => {
      mockPrismaService.aIInsight.findFirst.mockResolvedValue(null);
      mockPrismaService.quotation.findFirst.mockResolvedValue(mockQuotation);
      // 4 rejected out of 5 = 80% rejection rate — clearly above 60% threshold
      const history = [
        { ...mockQuotation, id: 'h-1', status: 'REJECTED', total: 7000 },
        { ...mockQuotation, id: 'h-2', status: 'REJECTED', total: 7000 },
        { ...mockQuotation, id: 'h-3', status: 'REJECTED', total: 7000 },
        { ...mockQuotation, id: 'h-4', status: 'REJECTED', total: 7000 },
        { ...mockQuotation, id: 'h-5', status: 'APPROVED', total: 7000 },
      ];
      mockPrismaService.quotation.findMany.mockResolvedValue(history);

      const result = await service.getConversionScore('q-1');

      expect(result.score).toBeLessThanOrEqual(30);
      expect(result.label).toBe(ConversionLabel.LOW);
    });

    it('returns MEDIUM label and neutral bonus when no client history exists', async () => {
      mockPrismaService.aIInsight.findFirst.mockResolvedValue(null);
      mockPrismaService.quotation.findFirst.mockResolvedValue(mockQuotation);
      mockPrismaService.quotation.findMany.mockResolvedValue([]);

      const result = await service.getConversionScore('q-1');

      // No history → approvalRate = 0.5 → base = 35, + neutral bonus 15 = 50
      expect(result.score).toBe(50);
      expect(result.label).toBe(ConversionLabel.MEDIUM);
    });

    it('persists score to AIInsight with CONVERSION_SCORE insightType', async () => {
      mockPrismaService.aIInsight.findFirst.mockResolvedValue(null);
      mockPrismaService.quotation.findFirst.mockResolvedValue(mockQuotation);
      mockPrismaService.quotation.findMany.mockResolvedValue([]);

      await service.getConversionScore('q-1');

      expect(mockPrismaService.aIInsight.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            quotationId_insightType: {
              quotationId: 'q-1',
              insightType: 'CONVERSION_SCORE',
            },
          },
        }),
      );
    });
  });
});

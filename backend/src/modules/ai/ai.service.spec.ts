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
const mockModelsList = jest.fn().mockResolvedValue({
  data: [
    { id: 'llama-3.1-70b-versatile' },
    { id: 'llama-3.1-8b-instant' },
    { id: 'llama3-8b-8192' },
  ],
});

jest.mock('groq-sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
    models: {
      list: mockModelsList,
    },
  })),
}));

const mockEmbeddingsCreate = jest.fn().mockResolvedValue({
  data: [{ embedding: Array(1536).fill(0.1) }],
});

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    embeddings: {
      create: mockEmbeddingsCreate,
    },
  })),
}));

const mockPrismaService = {
  quotation: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    groupBy: jest.fn(),
  },
  user: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  aIInsight: {
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    upsert: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
  },
  $queryRaw: jest.fn(),
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

  it('throws on construction when OPENAI_API_KEY is not set', () => {
    const savedGroq = process.env.GROQ_API_KEY;
    const savedOpenAI = process.env.OPENAI_API_KEY;
    process.env.GROQ_API_KEY = 'test-key';
    delete process.env.OPENAI_API_KEY;
    expect(
      () => new AIService(mockPrismaService as never, mockLogger as never),
    ).toThrow('OPENAI_API_KEY is not set');
    process.env.GROQ_API_KEY = savedGroq;
    process.env.OPENAI_API_KEY = savedOpenAI;
  });
});

describe('AIService', () => {
  let service: AIService;

  beforeEach(async () => {
    process.env.GROQ_API_KEY = 'test-key';
    process.env.OPENAI_API_KEY = 'test-openai-key';
    mockCreate.mockResolvedValue(mockGroqResponse);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AppLogger, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<AIService>(AIService);
    await service.onModuleInit();
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

  function mockWinLossSQL({
    statusRows = [] as { status: string; _count: { _all: number }; _avg: { total: number | null } }[],
    repRows = [] as { createdById: string; status: string; _count: { _all: number } }[],
    repUsers = [] as { id: string; name: string }[],
    bucketRows = [] as { bucket: string; total: bigint; approved: bigint; decided: bigint }[],
  } = {}) {
    mockPrismaService.quotation.groupBy
      .mockResolvedValueOnce(statusRows) // by status
      .mockResolvedValueOnce(repRows); // by (createdById, status)
    mockPrismaService.user.findMany.mockResolvedValue(repUsers);
    mockPrismaService.$queryRaw.mockResolvedValue(bucketRows);
  }

  describe('getWinLossAnalysis', () => {
    it('computes overall approval rate correctly', async () => {
      mockPrismaService.aIInsight.findFirst.mockResolvedValue(null);
      mockWinLossSQL({
        statusRows: [
          { status: 'APPROVED', _count: { _all: 2 }, _avg: { total: 15000 } },
          { status: 'REJECTED', _count: { _all: 1 }, _avg: { total: 8000 } },
        ],
      });

      const result = await service.getWinLossAnalysis();

      // 2 approved / (2 approved + 1 rejected) = 66.7%
      expect(result.approvalRate).toBe(66.7);
    });

    it('computes avg deal sizes for approved and rejected quotations', async () => {
      mockPrismaService.aIInsight.findFirst.mockResolvedValue(null);
      mockWinLossSQL({
        statusRows: [
          { status: 'APPROVED', _count: { _all: 2 }, _avg: { total: 15000 } },
          { status: 'REJECTED', _count: { _all: 1 }, _avg: { total: 8000 } },
        ],
      });

      const result = await service.getWinLossAnalysis();

      expect(result.avgApprovedDeal).toBe(15000);
      expect(result.avgRejectedDeal).toBe(8000);
    });

    it('builds byRep stats sorted by approvalRate descending', async () => {
      mockPrismaService.aIInsight.findFirst.mockResolvedValue(null);
      // Alice: 1 approved, 1 rejected → 50%. Bob: 1 approved → 100%
      mockWinLossSQL({
        statusRows: [
          { status: 'APPROVED', _count: { _all: 2 }, _avg: { total: 15000 } },
          { status: 'REJECTED', _count: { _all: 1 }, _avg: { total: 8000 } },
        ],
        repRows: [
          { createdById: 'user-alice', status: 'APPROVED', _count: { _all: 1 } },
          { createdById: 'user-alice', status: 'REJECTED', _count: { _all: 1 } },
          { createdById: 'user-bob', status: 'APPROVED', _count: { _all: 1 } },
        ],
        repUsers: [
          { id: 'user-alice', name: 'Alice' },
          { id: 'user-bob', name: 'Bob' },
        ],
      });

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
      expect(mockPrismaService.quotation.groupBy).not.toHaveBeenCalled();
    });

    it('returns zero rates when no approved or rejected quotations exist', async () => {
      mockPrismaService.aIInsight.findFirst.mockResolvedValue(null);
      mockWinLossSQL({
        statusRows: [
          { status: 'SENT', _count: { _all: 1 }, _avg: { total: 3000 } },
        ],
      });

      const result = await service.getWinLossAnalysis();

      expect(result.approvalRate).toBe(0);
      expect(result.avgApprovedDeal).toBe(0);
      expect(result.avgRejectedDeal).toBe(0);
    });

    it('assigns quotations to correct deal-size buckets', async () => {
      mockPrismaService.aIInsight.findFirst.mockResolvedValue(null);
      mockWinLossSQL({
        statusRows: [
          { status: 'APPROVED', _count: { _all: 2 }, _avg: { total: 6500 } },
          { status: 'REJECTED', _count: { _all: 1 }, _avg: { total: 25000 } },
        ],
        bucketRows: [
          { bucket: '<5k', total: 1n, approved: 1n, decided: 1n },
          { bucket: '5k–20k', total: 1n, approved: 1n, decided: 1n },
          { bucket: '>20k', total: 1n, approved: 0n, decided: 1n },
        ],
      });

      const result = await service.getWinLossAnalysis();

      const buckets = Object.fromEntries(result.byDealSize.map((b) => [b.bucket, b]));
      expect(buckets['<5k'].total).toBe(1);
      expect(buckets['5k–20k'].total).toBe(1);
      expect(buckets['>20k'].total).toBe(1);
    });

    it('persists result to AIInsight with WIN_LOSS_ANALYSIS insightType', async () => {
      mockPrismaService.aIInsight.findFirst.mockResolvedValue(null);
      mockWinLossSQL({
        statusRows: [
          { status: 'APPROVED', _count: { _all: 1 }, _avg: { total: 10000 } },
        ],
      });

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
      // First findFirst (cache check) returns null; second (before persist) returns stale row.
      mockPrismaService.aIInsight.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'wl-cache-1', content: '{}' });
      mockWinLossSQL({
        statusRows: [
          { status: 'APPROVED', _count: { _all: 1 }, _avg: { total: 10000 } },
        ],
      });

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

  describe('getConversionScores', () => {
    const cachedInsight = (quotationId: string, score: number) => ({
      id: `insight-${quotationId}`,
      quotationId,
      insightType: 'CONVERSION_SCORE',
      content: JSON.stringify({ score, label: 'HIGH' }),
      expiresAt: new Date(Date.now() + 86400000),
    });

    beforeEach(() => {
      mockPrismaService.aIInsight.findMany.mockResolvedValue([]);
      mockPrismaService.quotation.findFirst.mockResolvedValue(null);
      mockPrismaService.quotation.findMany.mockResolvedValue([]);
    });

    it('returns empty array when quotationIds is empty', async () => {
      const result = await service.getConversionScores([]);
      expect(result).toEqual([]);
    });

    it('returns cached scores without computing when all are in cache', async () => {
      mockPrismaService.aIInsight.findMany
        .mockResolvedValueOnce([cachedInsight('q-1', 72), cachedInsight('q-2', 50)])
        .mockResolvedValueOnce([cachedInsight('q-1', 72), cachedInsight('q-2', 50)]);

      const result = await service.getConversionScores(['q-1', 'q-2']);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ quotationId: 'q-1', score: 72 });
      expect(result[1]).toMatchObject({ quotationId: 'q-2', score: 50 });
      expect(mockPrismaService.quotation.findFirst).not.toHaveBeenCalled();
    });

    it('computes and caches missing scores then returns all', async () => {
      mockPrismaService.aIInsight.findMany
        .mockResolvedValueOnce([cachedInsight('q-1', 72)])
        .mockResolvedValueOnce([cachedInsight('q-1', 72), cachedInsight('q-2', 50)]);
      mockPrismaService.aIInsight.findFirst.mockResolvedValue(null);
      mockPrismaService.quotation.findFirst.mockResolvedValue(mockQuotation);

      const result = await service.getConversionScores(['q-1', 'q-2']);

      expect(result).toHaveLength(2);
      expect(mockPrismaService.aIInsight.upsert).toHaveBeenCalled();
    });

    it('propagates NotFoundException when a missing id does not exist in DB', async () => {
      mockPrismaService.aIInsight.findMany.mockResolvedValueOnce([]);
      mockPrismaService.aIInsight.findFirst.mockResolvedValue(null);
      mockPrismaService.quotation.findFirst.mockResolvedValue(null);

      await expect(
        service.getConversionScores(['q-999']),
      ).rejects.toThrow('Quotation q-999 not found');
    });
  });

  describe('askAboutQuotation', () => {
    const mockAnswer = {
      choices: [{ message: { content: 'The margin looks reasonable.' } }],
    };

    it('returns answer from Groq for a valid question', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue(mockQuotation);
      mockPrismaService.quotation.findMany.mockResolvedValue([]);
      mockCreate.mockResolvedValue(mockAnswer);

      const result = await service.askAboutQuotation(
        'q-1',
        'Is the margin reasonable?',
      );

      expect(result.answer).toBe('The margin looks reasonable.');
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('calls Groq with system/user message split', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue(mockQuotation);
      mockPrismaService.quotation.findMany.mockResolvedValue([]);
      mockCreate.mockResolvedValue(mockAnswer);

      await service.askAboutQuotation('q-1', 'What is the total?');

      const callArgs = mockCreate.mock.calls[0][0] as {
        messages: { role: string; content: string }[];
      };
      expect(callArgs.messages[0].role).toBe('system');
      expect(callArgs.messages[1].role).toBe('user');
      expect(callArgs.messages[1].content).toBe('What is the total?');
    });

    it('includes client history in system prompt when previous deals exist', async () => {
      const prevDeal = {
        ...mockQuotation,
        id: 'q-old',
        status: 'APPROVED',
        total: 5000,
        quotationNumber: 'QT-2026-0001',
      };
      mockPrismaService.quotation.findFirst.mockResolvedValue(mockQuotation);
      mockPrismaService.quotation.findMany.mockResolvedValue([prevDeal]);
      mockCreate.mockResolvedValue(mockAnswer);

      await service.askAboutQuotation('q-1', 'Is this deal typical?');

      const callArgs = mockCreate.mock.calls[0][0] as {
        messages: { role: string; content: string }[];
      };
      const systemPrompt = callArgs.messages[0].content;
      expect(systemPrompt).toContain('Client history');
      expect(systemPrompt).toContain('QT-2026-0001');
      expect(systemPrompt).toContain('Average deal size');
    });

    it('throws NotFoundException when quotation not found', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue(null);

      await expect(
        service.askAboutQuotation('q-999', 'Any question?'),
      ).rejects.toThrow('Quotation q-999 not found');
    });

    it('throws BadRequestException for blank question', async () => {
      await expect(
        service.askAboutQuotation('q-1', '   '),
      ).rejects.toThrow('Please enter a question.');
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('truncates question to 500 characters before sending to Groq', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue(mockQuotation);
      mockPrismaService.quotation.findMany.mockResolvedValue([]);
      mockCreate.mockResolvedValue(mockAnswer);
      const longQuestion = 'a'.repeat(600);

      await service.askAboutQuotation('q-1', longQuestion);

      const callArgs = mockCreate.mock.calls[0][0] as {
        messages: { role: string; content: string }[];
      };
      expect(callArgs.messages[1].content).toHaveLength(500);
    });

    it('propagates Groq error when all models fail', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue(mockQuotation);
      mockPrismaService.quotation.findMany.mockResolvedValue([]);
      mockCreate.mockRejectedValue(new Error('Groq unavailable'));

      await expect(
        service.askAboutQuotation('q-1', 'Is it risky?'),
      ).rejects.toThrow('Groq unavailable');
    });
  });

  describe('askLessonsLearned', () => {
    const mockChunks = [
      {
        source: '63. N+1 queries — per-row useQuery in a list replaced with a single batch query',
        content: 'Full entry text about N+1 query problem.',
        distance: 0.2,
      },
      {
        source: '12. Switched from Gemini to Groq for AI completions',
        content: 'Full entry text about switching to Groq.',
        distance: 0.2,
      },
    ];

    beforeEach(() => {
      mockPrismaService.$queryRaw.mockResolvedValue(mockChunks);
      mockCreate.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                answer: 'Answer grounded in lessons learned.',
                citedEntries: [
                  '63. N+1 queries — per-row useQuery in a list replaced with a single batch query',
                  '12. Switched from Gemini to Groq for AI completions',
                ],
              }),
            },
          },
        ],
      });
    });

    it('returns answer and sources for a valid question', async () => {
      const result = await service.askLessonsLearned('Why did we switch to Groq?');

      expect(result.answer).toBe('Answer grounded in lessons learned.');
      expect(result.sources).toEqual([
        '63. N+1 queries — per-row useQuery in a list replaced with a single batch query',
        '12. Switched from Gemini to Groq for AI completions',
      ]);
    });

    it('embeds the question using OpenAI text-embedding-3-small', async () => {
      await service.askLessonsLearned('Why did we switch to Groq?');

      expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: 'Why did we switch to Groq?',
      });
    });

    it('calls $queryRaw for vector similarity search', async () => {
      await service.askLessonsLearned('Why did we switch to Groq?');

      expect(mockPrismaService.$queryRaw).toHaveBeenCalled();
    });

    it('injects retrieved chunks as context in the Groq prompt', async () => {
      await service.askLessonsLearned('Why did we switch to Groq?');

      const systemMessage = mockCreate.mock.calls[0][0].messages[0].content as string;
      expect(systemMessage).toContain('63. N+1 queries');
      expect(systemMessage).toContain('Full entry text about N+1 query problem.');
    });

    it('throws BadRequestException for a blank question', async () => {
      await expect(service.askLessonsLearned('   ')).rejects.toThrow(
        'Please enter a question.',
      );
    });

    it('truncates question to 500 characters before embedding', async () => {
      const longQuestion = 'a'.repeat(600);
      await service.askLessonsLearned(longQuestion);

      expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: 'a'.repeat(500),
      });
    });

    it('propagates error when OpenAI embeddings fail', async () => {
      mockEmbeddingsCreate.mockRejectedValue(new Error('OpenAI unavailable'));

      await expect(
        service.askLessonsLearned('Any question?'),
      ).rejects.toThrow('OpenAI unavailable');
    });

    it('propagates error when Groq fails', async () => {
      mockEmbeddingsCreate.mockResolvedValue({
        data: [{ embedding: Array(1536).fill(0.1) }],
      });
      mockCreate.mockRejectedValue(new Error('Groq unavailable'));

      await expect(
        service.askLessonsLearned('Any question?'),
      ).rejects.toThrow('Groq unavailable');
    });
  });
});

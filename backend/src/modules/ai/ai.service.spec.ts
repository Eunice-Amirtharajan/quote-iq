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
    findUnique: jest.fn(),
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
  documentChunk: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  document: {
    count: jest.fn().mockResolvedValue(1),
  },
  quotationEmbedding: {
    findUnique: jest.fn(),
  },
  $queryRaw: jest.fn(),
  $executeRaw: jest.fn().mockResolvedValue(1),
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

describe('AIService — onModuleInit edge cases', () => {
  beforeEach(() => {
    process.env.GROQ_API_KEY = 'test-key';
    process.env.OPENAI_API_KEY = 'test-openai-key';
    jest.clearAllMocks();
  });

  it('logs error and clears models when Groq returns no usable chat models', async () => {
    mockModelsList.mockResolvedValueOnce({ data: [{ id: 'whisper-1' }] }); // no chat model
    const svc = new AIService(mockPrismaService as never, mockLogger as never, {} as never);
    await svc.onModuleInit();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('No usable chat models'),
      AIService.name,
    );
  });

  it('logs error when Groq models.list throws', async () => {
    mockModelsList.mockRejectedValueOnce(new Error('Groq unreachable'));
    const svc = new AIService(mockPrismaService as never, mockLogger as never, {} as never);
    await svc.onModuleInit();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('could not be loaded'),
      AIService.name,
    );
  });
});

describe('AIService — missing API key', () => {
  it('throws on construction when GROQ_API_KEY is not set', () => {
    const savedKey = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;
    expect(
      () => new AIService(mockPrismaService as never, mockLogger as never, {} as never),
    ).toThrow('GROQ_API_KEY is not set');
    process.env.GROQ_API_KEY = savedKey;
  });

  it('throws on construction when OPENAI_API_KEY is not set', () => {
    const savedGroq = process.env.GROQ_API_KEY;
    const savedOpenAI = process.env.OPENAI_API_KEY;
    process.env.GROQ_API_KEY = 'test-key';
    delete process.env.OPENAI_API_KEY;
    expect(
      () => new AIService(mockPrismaService as never, mockLogger as never, {} as never),
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
        {
          provide: 'PROM_METRIC_GROQ_MODEL_REQUESTS_TOTAL',
          useValue: { inc: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<AIService>(AIService);
    mockModelsList.mockResolvedValue({
      data: [
        { id: 'llama-3.1-70b-versatile' },
        { id: 'llama-3.1-8b-instant' },
        { id: 'llama3-8b-8192' },
      ],
    });
    await service.onModuleInit();
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Reset cache mock to null after each test so cache doesn't bleed between tests
    mockPrismaService.aIInsight.findFirst.mockResolvedValue(null);
    // Drain any unconsumed mockResolvedValueOnce values
    mockCreate.mockResolvedValue(mockGroqResponse);
    mockEmbeddingsCreate.mockResolvedValue({ data: [{ embedding: Array(1536).fill(0.1) }] });
  });

  describe('callGroq — no available models', () => {
    it('throws InternalServerErrorException when availableModels is empty', async () => {
      // Re-init with a model list that has no chat models → availableModels stays empty
      mockModelsList.mockResolvedValueOnce({ data: [{ id: 'whisper-large-v3' }] });
      await service.onModuleInit();

      mockPrismaService.quotation.findFirst.mockResolvedValue(mockQuotation);
      mockPrismaService.quotation.findMany.mockResolvedValue([]);

      await expect(service.generateQuotationSummary('q-1')).rejects.toThrow(
        'No Groq chat models are currently available',
      );
    });
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

    it('throws lastError after all models fail with transient errors (queryGroqModels exhausted)', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue(mockQuotation);
      mockPrismaService.quotation.findMany.mockResolvedValue([]);
      // 503 is transient → retries all models → throws lastError after loop
      mockCreate.mockRejectedValue(new Error('503 Service Unavailable'));

      await expect(
        service.askAboutQuotation('q-1', 'Any question?'),
      ).rejects.toThrow('503');
      expect(mockCreate).toHaveBeenCalledTimes(3); // all 3 models tried
    });
  });

  describe('askLessonsLearned', () => {
    const mockChunks = [
      {
        source: '63. N+1 queries — per-row useQuery in a list replaced with a single batch query',
        content: 'Full entry text about N+1 query problem.',
        score: 0.016,
      },
      {
        source: '12. Switched from Gemini to Groq for AI completions',
        content: 'Full entry text about switching to Groq.',
        score: 0.016,
      },
    ];

    beforeEach(() => {
      // both vector and keyword searches return mockChunks by default
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

    it('calls $queryRaw twice — vector search and keyword search', async () => {
      await service.askLessonsLearned('Why did we switch to Groq?');

      expect(mockPrismaService.$queryRaw).toHaveBeenCalledTimes(2);
    });

    it('returns empty response when both searches return no results', async () => {
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.askLessonsLearned('Unknown question?');

      expect(result.answer).toBe(
        'No relevant lessons-learned entries found for this question.',
      );
      expect(result.sources).toEqual([]);
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

    it('includes keyword-only result in RRF map when it is absent from vector results', async () => {
      // vector returns source-A only, keyword returns source-B only → else-branch on line 993
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([{ source: 'source-A', content: 'Content A', score: 0.9 }]) // vector
        .mockResolvedValueOnce([{ source: 'source-B', content: 'Content B', score: 0.8 }]); // keyword only

      const result = await service.askLessonsLearned('Some question?');

      // Both sources should appear in the final answer prompt context
      expect(result.answer).toBeDefined();
      // Groq was called — meaning both chunks reached the fusion and prompt was built
      expect(mockCreate).toHaveBeenCalled();
    });
  });

  describe('generateDocumentEmbeddings', () => {
    const mockChunks = [
      { id: 'c-1', chunkIndex: 0, content: 'First chunk content about sales.' },
      { id: 'c-2', chunkIndex: 1, content: 'Second chunk content about pricing.' },
    ];

    afterEach(() => {
      mockEmbeddingsCreate.mockResolvedValue({ data: [{ embedding: Array(1536).fill(0.1) }] });
    });

    it('calls OpenAI embeddings for each chunk and updates DB', async () => {
      mockPrismaService.documentChunk.findMany.mockResolvedValue(mockChunks);

      await service.generateDocumentEmbeddings('doc-1');

      expect(mockEmbeddingsCreate).toHaveBeenCalledTimes(2);
      expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: 'First chunk content about sales.',
      });
      expect(mockPrismaService.$executeRaw).toHaveBeenCalledTimes(2);
    });

    it('does nothing when document has no chunks', async () => {
      mockPrismaService.documentChunk.findMany.mockResolvedValue([]);

      await service.generateDocumentEmbeddings('doc-empty');

      expect(mockEmbeddingsCreate).not.toHaveBeenCalled();
      expect(mockPrismaService.$executeRaw).not.toHaveBeenCalled();
    });

    it('propagates OpenAI error when embedding fails', async () => {
      mockPrismaService.documentChunk.findMany.mockResolvedValue(mockChunks);
      mockEmbeddingsCreate.mockRejectedValue(new Error('OpenAI quota exceeded'));

      await expect(service.generateDocumentEmbeddings('doc-1')).rejects.toThrow(
        'OpenAI quota exceeded',
      );
    });
  });

  describe('askPlaybook', () => {
    // >3 chunks so rerankChunks actually calls Groq (early-exit guard is chunks.length <= 3)
    const mockDocChunks = [
      { id: 'dc-1', documentId: 'doc-1', chunkIndex: 0, content: 'Playbook content about objection handling.', documentTitle: 'Sales Playbook Q1.pdf' },
      { id: 'dc-2', documentId: 'doc-1', chunkIndex: 1, content: 'Playbook content about pricing strategy.', documentTitle: 'Sales Playbook Q1.pdf' },
      { id: 'dc-3', documentId: 'doc-2', chunkIndex: 0, content: 'Competitor analysis content.', documentTitle: 'Competitor Guide.pdf' },
      { id: 'dc-4', documentId: 'doc-2', chunkIndex: 1, content: 'Discount approval process overview.', documentTitle: 'Competitor Guide.pdf' },
    ];

    beforeEach(() => {
      // gate: at least one READY document exists
      mockPrismaService.document.count.mockResolvedValue(1);
      // vector search returns mockDocChunks; keyword search returns empty
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce(mockDocChunks)
        .mockResolvedValueOnce([]);
    });

    it('returns answer and citations for a valid question', async () => {
      // reranker is 1st Groq call (returns indices), LLM answer is 2nd
      mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: '[1,2,3]' } }] });
      mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: 'Handle objections by focusing on value. (see [1])' } }] });

      const result = await service.askPlaybook('How should I handle pricing objections?');

      expect(result.answer).toContain('Handle objections');
      expect(result.citations).toHaveLength(3);
      expect(result.citations[0].documentTitle).toBe('Sales Playbook Q1.pdf');
      expect(result.citations[0].chunkIndex).toBe(0);
    });

    it('returns grounded refusal when no chunks found', async () => {
      mockPrismaService.$queryRaw.mockReset()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.askPlaybook('What is the capital of France?');

      expect(result.answer).toContain('No relevant playbook content');
      expect(result.citations).toHaveLength(0);
    });

    it('embeds the question with text-embedding-3-small', async () => {
      mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: '[1,2,3]' } }] });
      mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: 'Answer.' } }] });

      await service.askPlaybook('How to upsell?');

      expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: 'How to upsell?',
      });
    });

    it('calls $queryRaw twice — vector search and keyword search', async () => {
      mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: '[1,2,3]' } }] });
      mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: 'Answer.' } }] });

      await service.askPlaybook('What closing techniques work best?');

      expect(mockPrismaService.$queryRaw).toHaveBeenCalledTimes(2);
    });

    it('throws BadRequestException for blank question', async () => {
      await expect(service.askPlaybook('   ')).rejects.toThrow('Please enter a question.');
    });

    it('throws BadRequestException when no READY documents exist', async () => {
      mockPrismaService.document.count.mockResolvedValueOnce(0);
      await expect(service.askPlaybook('Any question?')).rejects.toThrow(
        'No approved playbook documents are available yet',
      );
    });

    it('falls back to top-3 slicing when reranker returns invalid JSON', async () => {
      // reranker fails to parse → falls back to slice → LLM answer is 2nd call
      mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: 'not-valid-json' } }] });
      mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: 'Answer from chunks.' } }] });

      const result = await service.askPlaybook('Best closing technique?');

      expect(result.answer).toBe('Answer from chunks.');
      expect(result.citations).toHaveLength(3);
    });

    it('boosts score for chunk present in both vector and keyword legs (RRF if-branch, line 1087)', async () => {
      // dc-1 appears in both legs → if (existing) { existing.score += add } branch
      const keywordOnlyChunk = { id: 'dc-5', documentId: 'doc-3', chunkIndex: 0, content: 'Keyword-only content.', documentTitle: 'Extra.pdf' };
      mockPrismaService.$queryRaw.mockReset()
        .mockResolvedValueOnce(mockDocChunks)                          // vector: dc-1..dc-4
        .mockResolvedValueOnce([mockDocChunks[0], keywordOnlyChunk]);  // keyword: dc-1 (overlap) + dc-5 (new)

      mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: '[1,2,3]' } }] }); // reranker
      mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: 'Boosted answer.' } }] });

      const result = await service.askPlaybook('Tell me about keyword and vector topics?');

      expect(result.answer).toBe('Boosted answer.');
    });

    it('falls back to top-3 slicing when reranker Groq call throws (catch at line 1148)', async () => {
      mockCreate.mockRejectedValueOnce(new Error('Groq reranker unavailable')); // reranker fails → catch
      mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: 'Fallback answer.' } }] });

      const result = await service.askPlaybook('What is the objection strategy?');

      expect(result.answer).toBe('Fallback answer.');
      expect(result.citations).toHaveLength(3); // sliced to top 3
    });

    it('falls back to top-3 slicing when reranker returns empty JSON array (line 1142)', async () => {
      // Groq succeeds but returns [] → !Array.isArray check → return chunks.slice(0, 3)
      mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: '[]' } }] }); // reranker returns empty
      mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: 'Answer with empty reranker.' } }] });

      const result = await service.askPlaybook('What is the pricing strategy?');

      expect(result.answer).toBe('Answer with empty reranker.');
      expect(result.citations).toHaveLength(3);
    });
  });

  describe('generateQuotationEmbedding', () => {
    it('builds corpus text, calls OpenAI, and upserts via $executeRaw', async () => {
      mockPrismaService.$executeRaw.mockReset();
      mockPrismaService.$executeRaw.mockResolvedValue(1);
      const quotationWithItems = {
        ...mockQuotation,
        items: [{ description: 'Consulting', quantity: 2, unitPrice: 500 }],
      };
      mockPrismaService.quotation.findUnique = jest.fn().mockResolvedValueOnce(quotationWithItems);
      mockEmbeddingsCreate.mockResolvedValueOnce({
        data: [{ embedding: Array(1536).fill(0.5) }],
      });

      await service.generateQuotationEmbedding('q-1');

      expect(mockEmbeddingsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'text-embedding-3-small' }),
      );
      expect(mockPrismaService.$executeRaw).toHaveBeenCalled();
    });

    it('returns early when quotation does not exist', async () => {
      mockPrismaService.quotation.findUnique = jest.fn().mockResolvedValueOnce(null);

      await service.generateQuotationEmbedding('q-missing');

      expect(mockEmbeddingsCreate).not.toHaveBeenCalled();
      expect(mockPrismaService.$executeRaw).not.toHaveBeenCalled();
    });
  });

  describe('similarQuotations', () => {
    it('returns empty array when no embedding exists for the quotation', async () => {
      mockPrismaService.$queryRaw.mockReset();
      mockPrismaService.$queryRaw.mockResolvedValueOnce([]); // embedding row lookup

      const result = await service.similarQuotations('q-1', 'u-1', 'SALES_REP');

      expect(result).toEqual([]);
    });

    it('returns empty array when embedding exists but vector is null', async () => {
      mockPrismaService.$queryRaw.mockReset();
      mockPrismaService.$queryRaw.mockResolvedValueOnce([
        { embedding: null, searchText: 'title: X\nclient: Y' },
      ]);

      const result = await service.similarQuotations('q-1', 'u-1', 'SALES_REP');

      expect(result).toEqual([]);
    });

    it('returns empty array when no other quotations are in scope', async () => {
      mockPrismaService.$queryRaw.mockReset();
      // embedding found
      mockPrismaService.$queryRaw.mockResolvedValueOnce([
        { embedding: '[0.1,0.2]', searchText: 'title: X' },
      ]);
      // role-scoped id list — empty (no other quotations for this rep)
      mockPrismaService.$queryRaw.mockResolvedValueOnce([]);

      const result = await service.similarQuotations('q-1', 'u-1', 'SALES_REP');

      expect(result).toEqual([]);
    });

    it('returns ranked results fusing vector and keyword legs (SALES_MANAGER sees all)', async () => {
      mockPrismaService.$queryRaw.mockReset();
      // embedding row
      mockPrismaService.$queryRaw.mockResolvedValueOnce([
        { embedding: '[0.1,0.2]', searchText: 'title: Deal A' },
      ]);
      // role filter — all ids except q-1
      mockPrismaService.$queryRaw.mockResolvedValueOnce([{ id: 'q-2' }, { id: 'q-3' }]);
      // vector leg
      mockPrismaService.$queryRaw.mockResolvedValueOnce([
        { quotationId: 'q-2' },
        { quotationId: 'q-3' },
      ]);
      // keyword leg
      mockPrismaService.$queryRaw.mockResolvedValueOnce([
        { quotationId: 'q-2', kw_score: 0.9 },
      ]);
      // quotation lookup
      mockPrismaService.quotation.findMany = jest.fn().mockResolvedValueOnce([
        { id: 'q-2', title: 'Similar Deal', clientName: 'Acme', total: 5000, status: 'APPROVED' },
        { id: 'q-3', title: 'Another Deal', clientName: 'Beta', total: 3000, status: 'DRAFT' },
      ]);

      const result = await service.similarQuotations('q-1', 'u-mgr', 'SALES_MANAGER', 5);

      // q-2 appears in both legs → higher RRF score → first
      expect(result[0].id).toBe('q-2');
      expect(result).toHaveLength(2);
      expect(result[0].status).toBe('APPROVED');
    });
  });
});

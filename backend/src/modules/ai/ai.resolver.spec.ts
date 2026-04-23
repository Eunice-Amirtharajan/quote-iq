import { Test, TestingModule } from '@nestjs/testing';
import { AIResolver } from './ai.resolver';
import { AIService } from './ai.service';
import { Recommendation } from './ai-insight.entity';

const mockAIService = {
  generateQuotationSummary: jest.fn(),
};

const mockSummary = {
  summary: 'Strong deal with good client history.',
  recommendation: Recommendation.PROCEED,
  keyPoints: ['Client has 80% approval rate', 'Deal within normal range'],
  riskFactors: ['Payment terms not confirmed'],
};

describe('AIResolver', () => {
  let resolver: AIResolver;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AIResolver, { provide: AIService, useValue: mockAIService }],
    }).compile();

    resolver = module.get<AIResolver>(AIResolver);
  });

  afterEach(() => jest.clearAllMocks());

  describe('quotationSummary', () => {
    it('calls AIService with correct quotationId', async () => {
      mockAIService.generateQuotationSummary.mockResolvedValue(mockSummary);

      await resolver.quotationSummary('q-1');

      expect(mockAIService.generateQuotationSummary).toHaveBeenCalledWith(
        'q-1',
      );
    });

    it('returns summary from AIService', async () => {
      mockAIService.generateQuotationSummary.mockResolvedValue(mockSummary);

      const result = await resolver.quotationSummary('q-1');

      expect(result).toEqual(mockSummary);
    });

    it('propagates error when AIService throws', async () => {
      mockAIService.generateQuotationSummary.mockRejectedValue(
        new Error('Gemini error'),
      );

      await expect(resolver.quotationSummary('q-1')).rejects.toThrow(
        'Gemini error',
      );
    });
  });
});

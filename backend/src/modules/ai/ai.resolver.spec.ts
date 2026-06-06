import { Test, TestingModule } from '@nestjs/testing';
import { AIResolver } from './ai.resolver';
import { AIService } from './ai.service';
import { Recommendation } from './ai-insight.entity';

const mockAIService = {
  generateQuotationSummary: jest.fn(),
  getConversionScore: jest.fn(),
  getWinLossAnalysis: jest.fn(),
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

  describe('winLossAnalysis', () => {
    const mockStats = {
      approvalRate: 66.7,
      avgApprovedDeal: 12000,
      avgRejectedDeal: 8500,
      byRep: [
        {
          repName: 'Alice',
          sent: 10,
          approved: 7,
          rejected: 3,
          approvalRate: 70.0,
        },
      ],
      byDealSize: [
        { bucket: '<5k', total: 6, approved: 4, approvalRate: 66.7 },
      ],
    };

    it('calls getWinLossAnalysis and returns stats', async () => {
      mockAIService.getWinLossAnalysis.mockResolvedValue(mockStats);

      const result = await resolver.winLossAnalysis();

      expect(mockAIService.getWinLossAnalysis).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockStats);
    });

    it('propagates error when service throws', async () => {
      mockAIService.getWinLossAnalysis.mockRejectedValue(new Error('DB error'));

      await expect(resolver.winLossAnalysis()).rejects.toThrow('DB error');
    });
  });

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

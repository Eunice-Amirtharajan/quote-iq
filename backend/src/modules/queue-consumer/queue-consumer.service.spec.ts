import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Nack } from '@golevelup/nestjs-rabbitmq';
import { QueueConsumerService } from './queue-consumer.service';
import { AIService } from '../ai/ai.service';
import { AppLogger } from '../../common/logger/logger.service';
import { ConversionLabel } from '../ai/ai-insight.entity';
import { getCorrelationId } from '../../common/correlation/correlation.store';

// socket.io is ESM-only — mock the gateway module to avoid import errors in Jest
jest.mock('../gateway/score.gateway');
import { ScoreGateway } from '../gateway/score.gateway';

const mockAIService = {
  getConversionScore: jest.fn(),
  generateQuotationEmbedding: jest.fn().mockResolvedValue(undefined),
};

const mockGateway = {
  emitScoreReady: jest.fn(),
};

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

const makeMsg = (deathCount?: number) => ({
  properties: {
    headers: deathCount != null
      ? { 'x-death': [{ count: deathCount }] }
      : {},
  },
});

describe('QueueConsumerService', () => {
  let service: QueueConsumerService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueConsumerService,
        { provide: AIService, useValue: mockAIService },
        { provide: ScoreGateway, useValue: mockGateway },
        { provide: AppLogger, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<QueueConsumerService>(QueueConsumerService);
  });

  describe('onQuoteCreated — success path', () => {
    it('calls getConversionScore, emits score.ready, generates embedding, and logs success', async () => {
      mockAIService.getConversionScore.mockResolvedValueOnce({
        score: 72,
        label: ConversionLabel.HIGH,
      });
      const payload = { quotationId: 'q-1', createdById: 'u-1' };

      const result = await service.onQuoteCreated(payload, makeMsg());

      expect(mockAIService.getConversionScore).toHaveBeenCalledWith('q-1');
      expect(mockGateway.emitScoreReady).toHaveBeenCalledWith('q-1', 72, ConversionLabel.HIGH);
      expect(mockAIService.generateQuotationEmbedding).toHaveBeenCalledWith('q-1');
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Score computed, embedding upserted'),
        QueueConsumerService.name,
      );
      expect(result).toBeUndefined();
    });

    it('nacks when generateQuotationEmbedding fails — embedding failure triggers retry', async () => {
      mockAIService.getConversionScore.mockResolvedValueOnce({
        score: 55,
        label: ConversionLabel.MEDIUM,
      });
      mockAIService.generateQuotationEmbedding.mockRejectedValueOnce(
        new Error('OpenAI embedding API down'),
      );

      const result = await service.onQuoteCreated(
        { quotationId: 'q-1', createdById: 'u-1' },
        makeMsg(0),
      );

      expect(result).toBeInstanceOf(Nack);
      expect((result as Nack).requeue).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to process quote.created'),
        expect.any(String),
        QueueConsumerService.name,
      );
    });
  });

  describe('onQuoteCreated — permanent failure (NotFoundException)', () => {
    it('nacks to DLQ immediately without retrying', async () => {
      mockAIService.getConversionScore.mockRejectedValueOnce(
        new NotFoundException('Quotation q-deleted not found'),
      );
      const payload = { quotationId: 'q-deleted', createdById: 'u-1' };

      const result = await service.onQuoteCreated(payload, makeMsg());

      expect(result).toBeInstanceOf(Nack);
      expect((result as Nack).requeue).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('permanent'),
        expect.any(String),
        QueueConsumerService.name,
      );
    });

    it('nacks to DLQ even on first attempt — does not wait for MAX_RETRIES', async () => {
      mockAIService.getConversionScore.mockRejectedValueOnce(
        new NotFoundException('Quotation q-gone not found'),
      );

      const result = await service.onQuoteCreated(
        { quotationId: 'q-gone', createdById: 'u-1' },
        makeMsg(0),
      );

      expect(result).toBeInstanceOf(Nack);
      expect((result as Nack).requeue).toBe(false);
    });
  });

  describe('onQuoteCreated — transient failure', () => {
    it('nacks with requeue:false on transient error before MAX_RETRIES', async () => {
      mockAIService.getConversionScore.mockRejectedValueOnce(
        new Error('Groq timeout'),
      );

      const result = await service.onQuoteCreated(
        { quotationId: 'q-1', createdById: 'u-1' },
        makeMsg(0),
      );

      expect(result).toBeInstanceOf(Nack);
      expect((result as Nack).requeue).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to process quote.created'),
        expect.any(String),
        QueueConsumerService.name,
      );
    });

    it('nacks with requeue:false when MAX_RETRIES is reached', async () => {
      mockAIService.getConversionScore.mockRejectedValueOnce(
        new Error('DB unavailable'),
      );

      const result = await service.onQuoteCreated(
        { quotationId: 'q-1', createdById: 'u-1' },
        makeMsg(2), // deathCount=2 → attempt 3 = MAX_RETRIES
      );

      expect(result).toBeInstanceOf(Nack);
      expect((result as Nack).requeue).toBe(false);
    });
  });

  describe('onQuoteCreated — x-death header', () => {
    it('logs attempt:1 when no x-death header is present', async () => {
      mockAIService.getConversionScore.mockRejectedValueOnce(new Error('err'));

      await service.onQuoteCreated(
        { quotationId: 'q-1', createdById: 'u-1' },
        makeMsg(),
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('attempt:1'),
        QueueConsumerService.name,
      );
    });

    it('logs attempt:2 when x-death count is 1', async () => {
      mockAIService.getConversionScore.mockRejectedValueOnce(new Error('err'));

      await service.onQuoteCreated(
        { quotationId: 'q-1', createdById: 'u-1' },
        makeMsg(1),
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('attempt:2'),
        QueueConsumerService.name,
      );
    });
  });
  describe('onQuoteCreated — correlation ID', () => {
    const msgWithCid = (cid: string) => ({ properties: { headers: { 'x-correlation-id': cid } } });
    // clearAllMocks keeps implementations — drop the capturing ones so later tests get plain mocks
    afterEach(() => {
      mockLogger.info.mockReset();
      mockLogger.error.mockReset();
    });

    it('restores the publisher’s correlation ID for the whole handler, so worker logs match the API request', async () => {
      const seen: (string | undefined)[] = [];
      mockLogger.info.mockImplementation(() => seen.push(getCorrelationId()));
      mockAIService.getConversionScore.mockImplementationOnce(async () => {
        seen.push(getCorrelationId());
        return { score: 72, label: ConversionLabel.HIGH };
      });

      await service.onQuoteCreated({ quotationId: 'q-1', createdById: 'u-1' }, msgWithCid('cid-from-api'));

      // "Received" log, the scoring call, and the success log all run under the same ID
      expect(seen).toEqual(['cid-from-api', 'cid-from-api', 'cid-from-api']);
      expect(getCorrelationId()).toBeUndefined(); // doesn't leak past the message
    });

    it('keeps the correlation ID on the failure log too', async () => {
      let idWhenLoggingError: string | undefined;
      mockLogger.error.mockImplementationOnce(() => {
        idWhenLoggingError = getCorrelationId();
      });
      mockAIService.getConversionScore.mockRejectedValueOnce(new Error('Groq timeout'));

      await service.onQuoteCreated({ quotationId: 'q-1', createdById: 'u-1' }, msgWithCid('cid-from-api'));

      expect(idWhenLoggingError).toBe('cid-from-api');
    });
  });
});

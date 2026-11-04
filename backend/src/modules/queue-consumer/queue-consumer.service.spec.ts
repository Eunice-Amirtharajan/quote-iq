import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AmqpConnection, Nack } from '@golevelup/nestjs-rabbitmq';
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

const mockAmqp = {
  publish: jest.fn().mockResolvedValue(true),
};

// retryCount = how many times this message was already retried (our x-retry-count header)
const makeMsg = (retryCount?: number) => ({
  properties: {
    messageId: 'outbox-1',
    headers:
      retryCount != null
        ? { 'x-retry-count': retryCount, 'x-correlation-id': 'cid-1' }
        : {},
  },
});

const apiError = (status: number) =>
  Object.assign(new Error(`API error ${status}`), { status });

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
        { provide: AmqpConnection, useValue: mockAmqp },
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
      expect(mockGateway.emitScoreReady).toHaveBeenCalledWith(
        'q-1',
        72,
        ConversionLabel.HIGH,
      );
      expect(mockAIService.generateQuotationEmbedding).toHaveBeenCalledWith(
        'q-1',
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Score computed, embedding upserted'),
        QueueConsumerService.name,
      );
      expect(result).toBeUndefined();
    });

    it('retries when generateQuotationEmbedding fails (the embedding is part of the job)', async () => {
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

      expect(result).toBeUndefined();
      expect(mockAmqp.publish).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to process quote.created'),
        expect.any(String),
        QueueConsumerService.name,
      );
    });
  });

  describe('onQuoteCreated — permanent failure', () => {
    it('sends a deleted quotation (NotFoundException) straight to the DLQ without retrying', async () => {
      mockAIService.getConversionScore.mockRejectedValueOnce(
        new NotFoundException('Quotation q-deleted not found'),
      );

      const result = await service.onQuoteCreated(
        { quotationId: 'q-deleted', createdById: 'u-1' },
        makeMsg(),
      );

      expect(result).toBeInstanceOf(Nack);
      expect((result as Nack).requeue).toBe(false);
      expect(mockAmqp.publish).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('permanent'),
        expect.any(String),
        QueueConsumerService.name,
      );
    });

    it.each([400, 401, 403, 422])(
      'treats a %i from an API as permanent: retrying the same request cannot help',
      async (status) => {
        mockAIService.getConversionScore.mockRejectedValueOnce(
          apiError(status),
        );

        const result = await service.onQuoteCreated(
          { quotationId: 'q-1', createdById: 'u-1' },
          makeMsg(0),
        );

        expect(result).toBeInstanceOf(Nack);
        expect(mockAmqp.publish).not.toHaveBeenCalled();
      },
    );
  });

  describe('onQuoteCreated — transient failure', () => {
    it('republishes to the retry queue with a 5s delay and acks the original', async () => {
      mockAIService.getConversionScore.mockRejectedValueOnce(
        new Error('Connection terminated unexpectedly'),
      );

      const result = await service.onQuoteCreated(
        { quotationId: 'q-1', createdById: 'u-1' },
        {
          properties: {
            messageId: 'outbox-1',
            headers: {
              'x-correlation-id': 'cid-1',
              'x-death': [{ count: 1 }],
            },
          },
        },
      );

      // Acked (undefined), not nacked: the retry copy carries the message on
      expect(result).toBeUndefined();
      expect(mockAmqp.publish).toHaveBeenCalledWith(
        'quoteiq.retry',
        'quoteiq.scoring.retry',
        { quotationId: 'q-1', createdById: 'u-1' },
        {
          persistent: true,
          messageId: 'outbox-1',
          expiration: '5000',
          headers: { 'x-correlation-id': 'cid-1', 'x-retry-count': 1 },
        },
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('attempt:1 (retrying in 5000ms)'),
        expect.any(String),
        QueueConsumerService.name,
      );
    });

    it('doubles the delay on the second attempt', async () => {
      mockAIService.getConversionScore.mockRejectedValueOnce(apiError(503));

      await service.onQuoteCreated(
        { quotationId: 'q-1', createdById: 'u-1' },
        makeMsg(1),
      );

      expect(mockAmqp.publish).toHaveBeenCalledWith(
        'quoteiq.retry',
        'quoteiq.scoring.retry',
        expect.anything(),
        expect.objectContaining({
          expiration: '10000',
          headers: expect.objectContaining({ 'x-retry-count': 2 }),
        }),
      );
    });

    it.each([408, 409, 429])(
      'retries a %i (timeout, conflict, rate limit)',
      async (status) => {
        mockAIService.getConversionScore.mockRejectedValueOnce(
          apiError(status),
        );

        const result = await service.onQuoteCreated(
          { quotationId: 'q-1', createdById: 'u-1' },
          makeMsg(0),
        );

        expect(result).toBeUndefined();
        expect(mockAmqp.publish).toHaveBeenCalledTimes(1);
      },
    );

    it('sends the third failure to the DLQ instead of retrying again', async () => {
      mockAIService.getConversionScore.mockRejectedValueOnce(
        new Error('DB unavailable'),
      );

      const result = await service.onQuoteCreated(
        { quotationId: 'q-1', createdById: 'u-1' },
        makeMsg(2), // two retries already, so this is attempt 3 of 3
      );

      expect(result).toBeInstanceOf(Nack);
      expect((result as Nack).requeue).toBe(false);
      expect(mockAmqp.publish).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('attempt:3 (retries exhausted'),
        expect.any(String),
        QueueConsumerService.name,
      );
    });

    it('falls back to the DLQ when the retry cannot be published, so nothing is lost', async () => {
      mockAIService.getConversionScore.mockRejectedValueOnce(new Error('blip'));
      mockAmqp.publish.mockRejectedValueOnce(new Error('channel closed'));

      const result = await service.onQuoteCreated(
        { quotationId: 'q-1', createdById: 'u-1' },
        makeMsg(0),
      );

      expect(result).toBeInstanceOf(Nack);
      expect((result as Nack).requeue).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Could not schedule a retry'),
        expect.any(String),
        QueueConsumerService.name,
      );
    });
  });

  describe('onQuoteCreated — attempt numbering', () => {
    it('logs attempt:1 when the message has no retry header', async () => {
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

    it('logs attempt:2 for a message retried once', async () => {
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
    const msgWithCid = (cid: string) => ({
      properties: { headers: { 'x-correlation-id': cid } },
    });
    // clearAllMocks keeps implementations — drop the capturing ones so later tests get plain mocks
    afterEach(() => {
      mockLogger.info.mockReset();
      mockLogger.error.mockReset();
    });

    it('restores the publisher’s correlation ID for the whole handler, so worker logs match the API request', async () => {
      const seen: (string | undefined)[] = [];
      mockLogger.info.mockImplementation(() => seen.push(getCorrelationId()));
      mockAIService.getConversionScore.mockImplementationOnce(() => {
        seen.push(getCorrelationId());
        return Promise.resolve({ score: 72, label: ConversionLabel.HIGH });
      });

      await service.onQuoteCreated(
        { quotationId: 'q-1', createdById: 'u-1' },
        msgWithCid('cid-from-api'),
      );

      // "Received" log, the scoring call, and the success log all run under the same ID
      expect(seen).toEqual(['cid-from-api', 'cid-from-api', 'cid-from-api']);
      expect(getCorrelationId()).toBeUndefined(); // doesn't leak past the message
    });

    it('keeps the correlation ID on the failure log too', async () => {
      let idWhenLoggingError: string | undefined;
      mockLogger.error.mockImplementationOnce(() => {
        idWhenLoggingError = getCorrelationId();
      });
      mockAIService.getConversionScore.mockRejectedValueOnce(
        new Error('Groq timeout'),
      );

      await service.onQuoteCreated(
        { quotationId: 'q-1', createdById: 'u-1' },
        msgWithCid('cid-from-api'),
      );

      expect(idWhenLoggingError).toBe('cid-from-api');
    });
  });
});

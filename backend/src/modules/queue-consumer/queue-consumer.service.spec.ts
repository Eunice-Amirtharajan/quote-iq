import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Nack } from '@golevelup/nestjs-rabbitmq';
import { QueueConsumerService } from './queue-consumer.service';
import { AIService } from '../ai/ai.service';
import { AppLogger } from '../../common/logger/logger.service';

const mockAIService = {
  getConversionScore: jest.fn(),
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
        { provide: AppLogger, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<QueueConsumerService>(QueueConsumerService);
  });

  describe('onQuoteCreated — success path', () => {
    it('calls getConversionScore and logs success', async () => {
      mockAIService.getConversionScore.mockResolvedValueOnce(undefined);
      const payload = { quotationId: 'q-1', createdById: 'u-1' };

      const result = await service.onQuoteCreated(payload, makeMsg());

      expect(mockAIService.getConversionScore).toHaveBeenCalledWith('q-1');
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Score computed and cached'),
        QueueConsumerService.name,
      );
      expect(result).toBeUndefined();
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
});

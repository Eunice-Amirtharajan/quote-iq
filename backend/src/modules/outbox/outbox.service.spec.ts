import { Test, TestingModule } from '@nestjs/testing';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { OutboxStatus } from '@prisma/client';
import { OutboxService, OUTBOX_MAX_ATTEMPTS } from './outbox.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AppLogger } from '../../common/logger/logger.service';
import { correlationStore } from '../../common/correlation/correlation.store';
import { context, propagation, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { W3CTraceContextPropagator } from '@opentelemetry/core';

const event = (over: Record<string, unknown> = {}) => ({
  id: 'evt-1',
  routingKey: 'quote.created',
  aggregateId: 'q-1',
  payload: { quotationId: 'q-1', createdById: 'u-1' },
  headers: { 'x-correlation-id': 'corr-1' },
  status: OutboxStatus.PENDING,
  attempts: 1,
  lastError: null,
  availableAt: new Date(),
  createdAt: new Date(),
  publishedAt: null,
  ...over,
});

const mockPrisma = {
  $queryRaw: jest.fn(),
  outboxEvent: {
    update: jest.fn().mockResolvedValue({}),
    groupBy: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
};
const mockAmqp = { publish: jest.fn().mockResolvedValue(true) };
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};
const mockCounter = { inc: jest.fn() };
const mockGauge = { set: jest.fn() };

describe('OutboxService', () => {
  let service: OutboxService;

  beforeEach(async () => {
    process.env.OUTBOX_RELAY_DISABLED = 'true';
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboxService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AmqpConnection, useValue: mockAmqp },
        { provide: AppLogger, useValue: mockLogger },
        { provide: 'PROM_METRIC_OUTBOX_EVENTS_TOTAL', useValue: mockCounter },
        { provide: 'PROM_METRIC_OUTBOX_BACKLOG_EVENTS', useValue: mockGauge },
      ],
    }).compile();
    service = module.get(OutboxService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('enqueue', () => {
    it('writes the event with the caller transaction and keeps the correlation id', async () => {
      const tx = {
        outboxEvent: { create: jest.fn().mockResolvedValue({ id: 'evt-1' }) },
      };
      await correlationStore.run('corr-42', () =>
        service.enqueue(tx as never, {
          routingKey: 'quote.created',
          aggregateId: 'q-1',
          payload: { quotationId: 'q-1' },
        }),
      );
      expect(tx.outboxEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          routingKey: 'quote.created',
          aggregateId: 'q-1',
          payload: { quotationId: 'q-1' },
          headers: expect.objectContaining({ 'x-correlation-id': 'corr-42' }),
        }),
      });
    });

    it('writes an empty correlation id when called outside a request', async () => {
      const tx = {
        outboxEvent: { create: jest.fn().mockResolvedValue({ id: 'evt-1' }) },
      };
      await service.enqueue(tx as never, {
        routingKey: 'quote.created',
        aggregateId: 'q-1',
        payload: { quotationId: 'q-1' },
      });
      expect(tx.outboxEvent.create.mock.calls[0][0].data.headers).toEqual(
        expect.objectContaining({ 'x-correlation-id': '' }),
      );
    });
  });

  describe('relay', () => {
    it('logs a non-Error relay failure as text', async () => {
      mockPrisma.$queryRaw.mockRejectedValueOnce('pool exhausted');
      await expect(service.relay()).resolves.toBe(0);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Outbox relay run failed',
        'pool exhausted',
        OutboxService.name,
      );
    });

    it('claims due events with SKIP LOCKED so replicas never publish the same row at once', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);
      await service.relay();
      const sql = (mockPrisma.$queryRaw.mock.calls[0][0] as string[]).join('?');
      expect(sql).toContain('FOR UPDATE SKIP LOCKED');
      expect(sql).toContain('"status" = \'PENDING\'');
    });

    it('publishes with the outbox id as messageId, then marks the event PUBLISHED', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([event()]);
      expect(await service.relay()).toBe(1);
      expect(mockAmqp.publish).toHaveBeenCalledWith(
        'quoteiq.events',
        'quote.created',
        { quotationId: 'q-1', createdById: 'u-1' },
        expect.objectContaining({
          messageId: 'evt-1',
          persistent: true,
          headers: expect.objectContaining({
            'x-correlation-id': 'corr-1',
            'x-outbox-id': 'evt-1',
          }),
        }),
      );
      expect(mockPrisma.outboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'evt-1' },
        data: expect.objectContaining({
          status: OutboxStatus.PUBLISHED,
          publishedAt: expect.any(Date),
        }),
      });
      expect(mockCounter.inc).toHaveBeenCalledWith({
        routing_key: 'quote.created',
        outcome: 'published',
      });
    });

    it('keeps a failed event PENDING and schedules a retry with backoff', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([event({ attempts: 3 })]);
      mockAmqp.publish.mockRejectedValueOnce(new Error('broker down'));
      const before = Date.now();
      await service.relay();
      const data = mockPrisma.outboxEvent.update.mock.calls[0][0].data;
      expect(data.status).toBeUndefined();
      expect(data.lastError).toBe('broker down');
      expect(data.availableAt.getTime()).toBeGreaterThanOrEqual(before + 8000); // 2^3 s
      expect(mockCounter.inc).toHaveBeenCalledWith({
        routing_key: 'quote.created',
        outcome: 'retry',
      });
    });

    it(`marks an event FAILED after ${OUTBOX_MAX_ATTEMPTS} attempts`, async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        event({ attempts: OUTBOX_MAX_ATTEMPTS }),
      ]);
      mockAmqp.publish.mockRejectedValueOnce(new Error('still down'));
      await service.relay();
      expect(mockPrisma.outboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'evt-1' },
        data: { status: OutboxStatus.FAILED, lastError: 'still down' },
      });
      expect(mockCounter.inc).toHaveBeenCalledWith({
        routing_key: 'quote.created',
        outcome: 'failed',
      });
    });

    it('does not start a second run while one is in progress', async () => {
      let release!: (rows: unknown[]) => void;
      mockPrisma.$queryRaw.mockReturnValueOnce(
        new Promise((r) => (release = r)),
      );
      const first = service.relay();
      expect(await service.relay()).toBe(0);
      release([]);
      await first;
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('never throws -- a failed claim is logged and retried on the next run', async () => {
      mockPrisma.$queryRaw.mockRejectedValueOnce(new Error('db unreachable'));
      await expect(service.relay()).resolves.toBe(0);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Outbox relay run failed',
        expect.any(String),
        OutboxService.name,
      );
    });

    it('reports the PENDING and FAILED backlog', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);
      mockPrisma.outboxEvent.groupBy.mockResolvedValueOnce([
        { status: OutboxStatus.PENDING, _count: { _all: 3 } },
      ]);
      await service.relay();
      expect(mockGauge.set).toHaveBeenCalledWith(
        { status: OutboxStatus.PENDING },
        3,
      );
      expect(mockGauge.set).toHaveBeenCalledWith(
        { status: OutboxStatus.FAILED },
        0,
      );
    });

    it('retries an event whose PUBLISHED update fails -- at-least-once, never lost', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([event()]);
      mockPrisma.outboxEvent.update
        .mockRejectedValueOnce(new Error('db blip'))
        .mockResolvedValueOnce({});
      await service.relay();
      const retry = mockPrisma.outboxEvent.update.mock.calls[1][0].data;
      expect(retry.status).toBeUndefined();
      expect(retry.lastError).toBe('db blip');
      expect(mockCounter.inc).toHaveBeenCalledWith({
        routing_key: 'quote.created',
        outcome: 'retry',
      });
    });

    it('swallows a failure to record the retry -- the lease expires and the event is retried', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([event()]);
      mockAmqp.publish.mockRejectedValueOnce(new Error('broker down'));
      mockPrisma.outboxEvent.update.mockRejectedValueOnce(
        new Error('db also down'),
      );
      await expect(service.relay()).resolves.toBe(1);
    });

    it('records a non-Error rejection as text', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([event()]);
      mockAmqp.publish.mockRejectedValueOnce('connection closed');
      await service.relay();
      expect(
        mockPrisma.outboxEvent.update.mock.calls[0][0].data.lastError,
      ).toBe('connection closed');
    });

    it('publishes an event that has no stored headers', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([event({ headers: null })]);
      await service.relay();
      expect(mockAmqp.publish).toHaveBeenCalledWith(
        'quoteiq.events',
        'quote.created',
        expect.anything(),
        expect.objectContaining({
          headers: expect.objectContaining({ 'x-outbox-id': 'evt-1' }),
        }),
      );
    });

    it('deletes PUBLISHED events older than 7 days, at most once an hour', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);
      mockPrisma.outboxEvent.deleteMany.mockResolvedValueOnce({ count: 4 });
      const before = Date.now();
      await service.relay();
      await service.relay();
      expect(mockPrisma.outboxEvent.deleteMany).toHaveBeenCalledTimes(1);
      const where = mockPrisma.outboxEvent.deleteMany.mock.calls[0][0].where;
      expect(where.status).toBe(OutboxStatus.PUBLISHED);
      expect(before - where.publishedAt.lt.getTime()).toBeGreaterThanOrEqual(
        7 * 864e5,
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('removed 4 published events'),
        OutboxService.name,
      );
      mockPrisma.$queryRaw.mockReset();
    });
  });

  describe('relay timer', () => {
    afterEach(() => {
      jest.useRealTimers();
      process.env.OUTBOX_RELAY_DISABLED = 'true';
    });

    it('runs the relay every 5s from startup until shutdown', () => {
      jest.useFakeTimers();
      delete process.env.OUTBOX_RELAY_DISABLED;
      const relay = jest.spyOn(service, 'relay').mockResolvedValue(0);
      service.onModuleInit();
      jest.advanceTimersByTime(10_000);
      expect(relay).toHaveBeenCalledTimes(2);
      service.onModuleDestroy();
      jest.advanceTimersByTime(10_000);
      expect(relay).toHaveBeenCalledTimes(2);
    });

    it('does not start when OUTBOX_RELAY_DISABLED=true, and shuts down cleanly', () => {
      jest.useFakeTimers();
      const relay = jest.spyOn(service, 'relay').mockResolvedValue(0);
      service.onModuleInit();
      jest.advanceTimersByTime(10_000);
      expect(relay).not.toHaveBeenCalled();
      expect(() => service.onModuleDestroy()).not.toThrow();
    });
  });
});

describe('OutboxService tracing', () => {
  const requestTrace = '4bf92f3577b34da6a3ce929d0e0e4736';
  const startupTrace = '0af7651916cd43dd8448eb211c80319c';
  let service: OutboxService;

  beforeAll(() => {
    context.setGlobalContextManager(
      new AsyncLocalStorageContextManager().enable(),
    );
    propagation.setGlobalPropagator(new W3CTraceContextPropagator());
  });
  afterAll(() => {
    context.disable();
    propagation.disable();
  });

  beforeEach(async () => {
    process.env.OUTBOX_RELAY_DISABLED = 'true';
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboxService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AmqpConnection, useValue: mockAmqp },
        { provide: AppLogger, useValue: mockLogger },
        { provide: 'PROM_METRIC_OUTBOX_EVENTS_TOTAL', useValue: mockCounter },
        { provide: 'PROM_METRIC_OUTBOX_BACKLOG_EVENTS', useValue: mockGauge },
      ],
    }).compile();
    service = module.get(OutboxService);
  });
  afterEach(() => jest.clearAllMocks());

  // The amqplib auto-instrumentation stamps the message with the trace that is active during
  // publish(), so a delayed publish must run inside the stored request trace, not the caller's
  it('publishes inside the trace of the request that wrote the event, whatever trace is active', async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([
      event({
        headers: {
          'x-correlation-id': 'corr-1',
          traceparent: `00-${requestTrace}-00f067aa0ba902b7-01`,
        },
      }),
    ]);
    let traceDuringPublish: string | undefined;
    mockAmqp.publish.mockImplementationOnce(() => {
      traceDuringPublish = trace.getSpanContext(context.active())?.traceId;
      return Promise.resolve(true);
    });
    const startupCtx = trace.setSpanContext(context.active(), {
      traceId: startupTrace,
      spanId: 'b7ad6b7169203331',
      traceFlags: 1,
    });
    await context.with(startupCtx, () => service.relay());
    expect(traceDuringPublish).toBe(requestTrace);
  });
});

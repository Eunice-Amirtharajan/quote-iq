import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { OutboxEvent, OutboxStatus, Prisma } from '@prisma/client';
import {
  context,
  propagation,
  ROOT_CONTEXT,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import { Counter, Gauge } from 'prom-client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppLogger } from '../../common/logger/logger.service';
import { getCorrelationId } from '../../common/correlation/correlation.store';
import { tracer } from '../../common/tracing/tracer';
import { EXCHANGE } from '../events/events.module';
import { describeError } from '../../common/helper/helper';

export const OUTBOX_MAX_ATTEMPTS = 10;
// A claimed row is invisible to other relays for this long; if the process dies mid-publish,
// the lease expires and the event is retried (no graceful shutdown needed for correctness)
const LEASE_SECONDS = 30;
const BATCH_SIZE = 20;
const POLL_MS = Number(process.env.OUTBOX_POLL_MS ?? 5000);
// amqp-connection-manager waits forever for a confirm while the broker is down; cap it so one
// outage can't stall the relay
const PUBLISH_TIMEOUT_MS = 10_000;
const RETENTION_DAYS = 7;
const CLEANUP_EVERY_MS = 60 * 60 * 1000;

export interface OutboxMessage {
  routingKey: string;
  aggregateId: string;
  payload: Prisma.InputJsonObject;
}

/**
 * Transactional outbox. Writers call enqueue() inside their own Prisma transaction, so
 * the event exists if and only if the change it describes was committed. relay() publishes due
 * events to RabbitMQ with publisher confirms: right after a commit (fast path) and on a timer
 * (safety net). Delivery is at-least-once; the outbox id travels as the AMQP messageId.
 */
@Injectable()
export class OutboxService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private relaying = false;
  private lastCleanup = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly amqp: AmqpConnection,
    private readonly logger: AppLogger,
    @InjectMetric('outbox_events_total')
    private readonly eventsCounter: Counter<string>,
    @InjectMetric('outbox_backlog_events')
    private readonly backlogGauge: Gauge<string>,
  ) {}

  onModuleInit(): void {
    if (process.env.OUTBOX_RELAY_DISABLED === 'true') return;
    // Run each tick from an empty trace context: a timer created during startup would otherwise
    // keep the "Create Nest App" trace active, and every relayed event would join that trace
    this.timer = setInterval(
      () => context.with(ROOT_CONTEXT, () => void this.relay()),
      POLL_MS,
    );
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Writes the event with the caller's transaction client -- never with this.prisma. */
  async enqueue(
    tx: Prisma.TransactionClient,
    message: OutboxMessage,
  ): Promise<OutboxEvent> {
    const headers: Record<string, string> = {
      'x-correlation-id': getCorrelationId() ?? '',
    };
    propagation.inject(context.active(), headers);
    return tx.outboxEvent.create({
      data: {
        routingKey: message.routingKey,
        aggregateId: message.aggregateId,
        payload: message.payload,
        headers,
      },
    });
  }

  /** Publishes due events. Never throws; returns how many events it handled. */
  async relay(): Promise<number> {
    if (this.relaying) return 0;
    this.relaying = true;
    try {
      const events = await this.claimDueEvents();
      for (const event of events) await this.publish(event);
      await this.refreshBacklogGauge();
      await this.cleanupIfDue();
      return events.length;
    } catch (err) {
      this.logger.error(
        'Outbox relay run failed',
        describeError(err),
        OutboxService.name,
      );
      return 0;
    } finally {
      this.relaying = false;
    }
  }

  // FOR UPDATE SKIP LOCKED + a lease: several replicas can relay at once without publishing the
  // same row concurrently. attempts counts this try.
  private claimDueEvents(): Promise<OutboxEvent[]> {
    return this.prisma.$queryRaw<OutboxEvent[]>`
      UPDATE "OutboxEvent"
      SET "availableAt" = now() + make_interval(secs => ${LEASE_SECONDS}::double precision),
          "attempts" = "attempts" + 1
      WHERE "id" IN (
        SELECT "id" FROM "OutboxEvent"
        WHERE "status" = 'PENDING' AND "availableAt" <= now()
        ORDER BY "createdAt"
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *`;
  }

  private async publish(event: OutboxEvent): Promise<void> {
    const stored = (event.headers ?? {}) as Record<string, string>;
    // The parent is the request that wrote the event, not whatever happens to be active now
    const parentCtx = propagation.extract(ROOT_CONTEXT, stored);
    const span = tracer.startSpan(
      `amqp.publish ${event.routingKey}`,
      undefined,
      parentCtx,
    );
    const publishCtx = trace.setSpan(parentCtx, span);
    const traceHeaders: Record<string, string> = {};
    propagation.inject(publishCtx, traceHeaders);
    try {
      // Publish with that span active: the amqplib auto-instrumentation creates its own publish
      // span and overwrites the traceparent header from the active context, so a delayed publish
      // would otherwise reach the consumer as an unrelated trace
      await context.with(publishCtx, () =>
        this.amqp.publish(EXCHANGE, event.routingKey, event.payload, {
          messageId: event.id,
          persistent: true,
          headers: {
            ...stored,
            ...traceHeaders,
            'x-published-at': Date.now(),
            'x-outbox-id': event.id,
          },
          timeout: PUBLISH_TIMEOUT_MS,
        } as Parameters<AmqpConnection['publish']>[3]),
      );
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: OutboxStatus.PUBLISHED,
          publishedAt: new Date(),
          lastError: null,
        },
      });
      this.eventsCounter.inc({
        routing_key: event.routingKey,
        outcome: 'published',
      });
      span.setStatus({ code: SpanStatusCode.OK });
      this.logger.info(
        `Outbox published ${event.routingKey} -- aggregateId:${event.aggregateId} attempt:${event.attempts} waitMs:${Date.now() - new Date(event.createdAt).getTime()}`,
        OutboxService.name,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const gaveUp = event.attempts >= OUTBOX_MAX_ATTEMPTS;
      // 2, 4, 8 ... seconds, capped at 5 minutes
      const backoffMs = Math.min(300, 2 ** event.attempts) * 1000;
      span.setStatus({ code: SpanStatusCode.ERROR, message });
      this.eventsCounter.inc({
        routing_key: event.routingKey,
        outcome: gaveUp ? 'failed' : 'retry',
      });
      this.logger.error(
        `Outbox publish failed ${event.routingKey} -- aggregateId:${event.aggregateId} attempt:${event.attempts}/${OUTBOX_MAX_ATTEMPTS}${gaveUp ? ' (giving up: status FAILED)' : ` (retry in ${backoffMs / 1000}s)`}`,
        err instanceof Error ? err.stack : message,
        OutboxService.name,
      );
      // If this update fails too, the lease simply expires and the event is retried
      await this.prisma.outboxEvent
        .update({
          where: { id: event.id },
          data: gaveUp
            ? { status: OutboxStatus.FAILED, lastError: message.slice(0, 1000) }
            : {
                availableAt: new Date(Date.now() + backoffMs),
                lastError: message.slice(0, 1000),
              },
        })
        .catch(() => undefined);
    } finally {
      span.end();
    }
  }

  private async refreshBacklogGauge(): Promise<void> {
    const counts = await this.prisma.outboxEvent.groupBy({
      by: ['status'],
      where: { status: { in: [OutboxStatus.PENDING, OutboxStatus.FAILED] } },
      _count: { _all: true },
    });
    for (const status of [OutboxStatus.PENDING, OutboxStatus.FAILED]) {
      const row = counts.find((c) => c.status === status);
      this.backlogGauge.set({ status }, row?._count._all ?? 0);
    }
  }

  private async cleanupIfDue(): Promise<void> {
    if (Date.now() - this.lastCleanup < CLEANUP_EVERY_MS) return;
    this.lastCleanup = Date.now();
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 864e5);
    const { count } = await this.prisma.outboxEvent.deleteMany({
      where: { status: OutboxStatus.PUBLISHED, publishedAt: { lt: cutoff } },
    });
    if (count > 0)
      this.logger.info(
        `Outbox cleanup removed ${count} published events older than ${RETENTION_DAYS} days`,
        OutboxService.name,
      );
  }
}

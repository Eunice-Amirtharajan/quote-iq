import { Injectable, NotFoundException } from '@nestjs/common';
import { RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import { EXCHANGE, QUEUE, ROUTING_KEY } from '../events/events.module';
import { AIService } from '../ai/ai.service';
import { ScoreGateway } from '../gateway/score.gateway';
import { AppLogger } from '../../common/logger/logger.service';
import { correlationStore } from '../../common/correlation/correlation.store';
import { context, propagation, SpanStatusCode } from '@opentelemetry/api';
import { tracer } from '../../common/tracing/tracer';

const MAX_RETRIES = 3;

@Injectable()
export class QueueConsumerService {
  constructor(
    private readonly ai: AIService,
    private readonly gateway: ScoreGateway,
    private readonly logger: AppLogger,
  ) {}

  @RabbitSubscribe({
    exchange: EXCHANGE,
    routingKey: ROUTING_KEY,
    queue: QUEUE,
    queueOptions: {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': 'quoteiq.dlx',
        'x-dead-letter-routing-key': 'quoteiq.scoring.dlq',
      },
    },
  })
  async onQuoteCreated(
    payload: { quotationId: string; createdById: string },
    amqpMsg: { properties: { headers: Record<string, unknown> } },
  ): Promise<void | Nack> {
    const { quotationId } = payload;
    const headers = amqpMsg.properties.headers;
    const xDeath = headers['x-death'] as { count: number }[] | undefined;
    const deathCount = xDeath?.[0]?.count ?? 0;
    const correlationId = (headers['x-correlation-id'] as string | undefined) ?? '';
    const publishedAt = (headers['x-published-at'] as number | undefined) ?? 0;
    const consumeStart = Date.now();
    const queueWaitMs = publishedAt ? consumeStart - publishedAt : -1;

    // Extract W3C trace context from AMQP headers to continue the distributed trace
    const parentCtx = propagation.extract(context.active(), headers);

    return correlationStore.run(correlationId, async () => {
      return context.with(parentCtx, async () => {
        const span = tracer.startSpan('amqp.consume quote.created');
        return context.with(context.active(), async () => {
          this.logger.info(
            `Received quote.created — quotationId:${quotationId} attempt:${deathCount + 1} queueWaitMs:${queueWaitMs}`,
            QueueConsumerService.name,
          );

          try {
            const result = await this.ai.getConversionScore(quotationId);
            this.gateway.emitScoreReady(quotationId, result.score, result.label);
            // Generate embedding for similar-quotes search — same message, second write.
            // If this throws, the whole handler retries via Nack(false) → DLQ after MAX_RETRIES.
            await this.ai.generateQuotationEmbedding(quotationId);
            const processingMs = Date.now() - consumeStart;
            span.setStatus({ code: SpanStatusCode.OK });
            this.logger.info(
              `Score computed, embedding upserted — quotationId:${quotationId} processingMs:${processingMs} totalMs:${queueWaitMs + processingMs}`,
              QueueConsumerService.name,
            );
          } catch (err) {
            const isPermanent = err instanceof NotFoundException;
            span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
            this.logger.error(
              `Failed to process quote.created — quotationId:${quotationId} attempt:${deathCount + 1}${isPermanent ? ' (permanent — sending to DLQ)' : ''}`,
              err instanceof Error ? err.stack : String(err),
              QueueConsumerService.name,
            );
            // Permanent failures (quotation deleted) go straight to DLQ — never requeue.
            // Transient failures retry up to MAX_RETRIES via DLX, then DLQ.
            // Nack(true) requeues immediately with no delay — avoid it; always use Nack(false).
            if (isPermanent || deathCount + 1 >= MAX_RETRIES) {
              span.end();
              return new Nack(false);
            }
            span.end();
            return new Nack(false);
          }
          span.end();
        });
      });
    });
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AmqpConnection,
  RabbitSubscribe,
  Nack,
} from '@golevelup/nestjs-rabbitmq';
import {
  EXCHANGE,
  QUEUE,
  RETRY_EXCHANGE,
  RETRY_QUEUE,
  ROUTING_KEY,
  scoringRetryDelayMs,
} from '../events/events.module';
import { AIService } from '../ai/ai.service';
import { ScoreGateway } from '../gateway/score.gateway';
import { AppLogger } from '../../common/logger/logger.service';
import { correlationStore } from '../../common/correlation/correlation.store';
import { context, propagation, SpanStatusCode } from '@opentelemetry/api';
import { tracer } from '../../common/tracing/tracer';
import { describeError } from '../../common/helper/helper';

const MAX_ATTEMPTS = 3;
const RETRY_HEADER = 'x-retry-count';

// Retrying can't fix these: the quotation is gone, or an API rejected the request itself
// (a bad key, an invalid payload). Timeouts, conflicts and rate limits are worth retrying.
const RETRYABLE_4XX = new Set([408, 409, 429]);
function isPermanentFailure(err: unknown): boolean {
  if (err instanceof NotFoundException) return true;
  const status = (err as { status?: unknown } | null)?.status;
  return (
    typeof status === 'number' &&
    status >= 400 &&
    status < 500 &&
    !RETRYABLE_4XX.has(status)
  );
}

@Injectable()
export class QueueConsumerService {
  constructor(
    private readonly ai: AIService,
    private readonly gateway: ScoreGateway,
    private readonly logger: AppLogger,
    private readonly amqp: AmqpConnection,
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
    amqpMsg: {
      properties: { headers: Record<string, unknown>; messageId?: string };
    },
  ): Promise<void | Nack> {
    const { quotationId } = payload;
    const headers = amqpMsg.properties.headers ?? {};
    // Our own counter: a retried message is a fresh publish, so the broker's x-death can't count it
    const retryCount = Number(headers[RETRY_HEADER]) || 0;
    const attempt = retryCount + 1;
    const correlationId =
      (headers['x-correlation-id'] as string | undefined) ?? '';
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
            `Received quote.created — quotationId:${quotationId} attempt:${attempt} queueWaitMs:${queueWaitMs}`,
            QueueConsumerService.name,
          );

          try {
            const result = await this.ai.getConversionScore(quotationId);
            this.gateway.emitScoreReady(
              quotationId,
              result.score,
              result.label,
            );
            // Generate embedding for similar-quotes search — same message, second write.
            // If this throws, the whole handler is retried (both writes are idempotent).
            await this.ai.generateQuotationEmbedding(quotationId);
            const processingMs = Date.now() - consumeStart;
            span.setStatus({ code: SpanStatusCode.OK });
            this.logger.info(
              `Score computed, embedding upserted — quotationId:${quotationId} processingMs:${processingMs} totalMs:${queueWaitMs + processingMs}`,
              QueueConsumerService.name,
            );
          } catch (err) {
            const permanent = isPermanentFailure(err);
            const exhausted = attempt >= MAX_ATTEMPTS;
            const delayMs = scoringRetryDelayMs() * 2 ** retryCount;
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: String(err),
            });
            let outcome = ` (retrying in ${delayMs}ms)`;
            if (permanent) outcome = ' (permanent — sending to DLQ)';
            else if (exhausted)
              outcome = ' (retries exhausted — sending to DLQ)';
            this.logger.error(
              `Failed to process quote.created — quotationId:${quotationId} attempt:${attempt}${outcome}`,
              describeError(err),
              QueueConsumerService.name,
            );
            // Nack(false) dead-letters to the DLQ. Nack(true) would requeue at once, in a tight loop.
            if (permanent || exhausted) {
              span.end();
              return new Nack(false);
            }
            // Transient: republish to the retry queue, which hands the message back to the scoring
            // queue once `expiration` passes, then ack this copy. If the process dies between the
            // two, the unacked original is redelivered; a duplicate is harmless (idempotent writes).
            try {
              const forward = { ...headers };
              delete forward['x-death'];
              await this.amqp.publish(RETRY_EXCHANGE, RETRY_QUEUE, payload, {
                persistent: true,
                messageId: amqpMsg.properties.messageId,
                expiration: String(delayMs),
                headers: { ...forward, [RETRY_HEADER]: retryCount + 1 },
              });
              span.end();
              return;
            } catch (publishErr) {
              this.logger.error(
                `Could not schedule a retry for quote.created — quotationId:${quotationId}; sending to DLQ`,
                describeError(publishErr),
                QueueConsumerService.name,
              );
              span.end();
              return new Nack(false);
            }
          }
          span.end();
        });
      });
    });
  }
}

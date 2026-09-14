import { Injectable, NotFoundException } from '@nestjs/common';
import { RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import { EXCHANGE, QUEUE, ROUTING_KEY } from '../events/events.module';
import { AIService } from '../ai/ai.service';
import { ScoreGateway } from '../gateway/score.gateway';
import { AppLogger } from '../../common/logger/logger.service';
import { correlationStore } from '../../common/correlation/correlation.store';

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
    // Re-attach the correlation ID from the message header so all log lines
    // in this handler share the same ID as the original HTTP request.
    const correlationId = (headers['x-correlation-id'] as string | undefined) ?? '';

    return correlationStore.run(correlationId, async () => {
      this.logger.info(
        `Received quote.created — quotationId:${quotationId} attempt:${deathCount + 1}`,
        QueueConsumerService.name,
      );

      try {
        const result = await this.ai.getConversionScore(quotationId);
        this.gateway.emitScoreReady(quotationId, result.score, result.label);
        this.logger.info(
          `Score computed and cached — quotationId:${quotationId}`,
          QueueConsumerService.name,
        );
      } catch (err) {
        const isPermanent = err instanceof NotFoundException;
        this.logger.error(
          `Failed to process quote.created — quotationId:${quotationId} attempt:${deathCount + 1}${isPermanent ? ' (permanent — sending to DLQ)' : ''}`,
          err instanceof Error ? err.stack : String(err),
          QueueConsumerService.name,
        );
        // Permanent failures (quotation deleted) go straight to DLQ — never requeue.
        // Transient failures retry up to MAX_RETRIES via DLX, then DLQ.
        // Nack(true) requeues immediately with no delay — avoid it; always use Nack(false).
        if (isPermanent || deathCount + 1 >= MAX_RETRIES) {
          return new Nack(false);
        }
        return new Nack(false);
      }
    });
  }
}

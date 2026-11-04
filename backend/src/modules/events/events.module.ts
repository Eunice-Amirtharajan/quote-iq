import { Global, Module } from '@nestjs/common';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';

export const EXCHANGE = 'quoteiq.events';
export const QUEUE = 'quoteiq.scoring';
export const ROUTING_KEY = 'quote.created';
export const DLX = 'quoteiq.dlx';
export const DLQ = 'quoteiq.scoring.dlq';
// Transient consumer failures wait here, then dead-letter back to QUEUE (only that queue,
// via the default exchange). The delay is per message (`expiration`), not a queue TTL:
// changing a queue's x-arguments later makes the broker refuse the redeclaration.
export const RETRY_EXCHANGE = 'quoteiq.retry';
export const RETRY_QUEUE = 'quoteiq.scoring.retry';

/** Base delay before a transient failure is retried; doubles on each further attempt */
export const scoringRetryDelayMs = (): number =>
  Number(process.env.SCORING_RETRY_DELAY_MS) || 5_000;

@Global()
@Module({
  imports: [
    RabbitMQModule.forRootAsync({
      useFactory: () => ({
        uri: process.env.RABBITMQ_URL,
        exchanges: [
          {
            name: EXCHANGE,
            type: 'topic',
            options: { durable: true },
          },
          {
            name: DLX,
            type: 'direct',
            options: { durable: true },
          },
          {
            name: RETRY_EXCHANGE,
            type: 'direct',
            options: { durable: true },
          },
        ],
        queues: [
          {
            name: DLQ,
            options: { durable: true },
            exchange: DLX,
            routingKey: DLQ,
          },
          {
            name: QUEUE,
            options: {
              durable: true,
              arguments: {
                'x-dead-letter-exchange': DLX,
                'x-dead-letter-routing-key': DLQ,
              },
            },
            exchange: EXCHANGE,
            routingKey: ROUTING_KEY,
          },
          {
            name: RETRY_QUEUE,
            options: {
              durable: true,
              arguments: {
                'x-dead-letter-exchange': '',
                'x-dead-letter-routing-key': QUEUE,
              },
            },
            exchange: RETRY_EXCHANGE,
            routingKey: RETRY_QUEUE,
          },
        ],
        connectionInitOptions: { wait: false },
      }),
    }),
  ],
  exports: [RabbitMQModule],
})
export class EventsModule {}

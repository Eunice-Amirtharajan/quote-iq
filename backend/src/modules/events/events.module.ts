import { Global, Module } from '@nestjs/common';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';

export const EXCHANGE = 'quoteiq.events';
export const QUEUE = 'quoteiq.scoring';
export const ROUTING_KEY = 'quote.created';
export const DLX = 'quoteiq.dlx';
export const DLQ = 'quoteiq.scoring.dlq';

@Global()
@Module({
  imports: [
    RabbitMQModule.forRootAsync({
      useFactory: () => ({
        uri: process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672',
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
        ],
        connectionInitOptions: { wait: false },
      }),
    }),
  ],
  exports: [RabbitMQModule],
})
export class EventsModule {}

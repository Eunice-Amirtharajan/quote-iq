import { Module } from '@nestjs/common';
import { QueueConsumerService } from './queue-consumer.service';
import { AIModule } from '../ai/ai.module';
import { GatewayModule } from '../gateway/gateway.module';

@Module({
  imports: [AIModule, GatewayModule],
  providers: [QueueConsumerService],
})
export class QueueConsumerModule {}

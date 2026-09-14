import { Module } from '@nestjs/common';
import { QueueConsumerService } from './queue-consumer.service';
import { AIModule } from '../ai/ai.module';

@Module({
  imports: [AIModule],
  providers: [QueueConsumerService],
})
export class QueueConsumerModule {}

import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { OutboxService } from './outbox.service';

@Module({
  imports: [EventsModule],
  providers: [OutboxService],
  exports: [OutboxService],
})
export class OutboxModule {}

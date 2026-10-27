import { Module } from '@nestjs/common';
import { QuotationsService } from './quotations.service';
import { QuotationsResolver } from './quotations.resolver';
import { PublicQuotationsResolver } from './public-quotations.resolver';
import { MailModule } from '../../common/mail/mail.module';
import { EventsModule } from '../events/events.module';
import { AIModule } from '../ai/ai.module';
import { OutboxModule } from '../outbox/outbox.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';

@Module({
  imports: [
    MailModule,
    EventsModule,
    AIModule,
    OutboxModule,
    IdempotencyModule,
  ],
  providers: [QuotationsService, QuotationsResolver, PublicQuotationsResolver],
})
export class QuotationsModule {}

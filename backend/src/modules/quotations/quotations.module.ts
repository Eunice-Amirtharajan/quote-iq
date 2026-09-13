import { Module } from '@nestjs/common';
import { QuotationsService } from './quotations.service';
import { QuotationsResolver } from './quotations.resolver';
import { PublicQuotationsResolver } from './public-quotations.resolver';
import { MailModule } from '../../common/mail/mail.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [MailModule, EventsModule],
  providers: [QuotationsService, QuotationsResolver, PublicQuotationsResolver],
})
export class QuotationsModule {}

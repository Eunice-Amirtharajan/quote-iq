import { Module } from '@nestjs/common';
import { QuotationsService } from './quotations.service';
import { QuotationsResolver } from './quotations.resolver';
import { PublicQuotationsResolver } from './public-quotations.resolver';

@Module({
  providers: [QuotationsService, QuotationsResolver, PublicQuotationsResolver],
})
export class QuotationsModule {}

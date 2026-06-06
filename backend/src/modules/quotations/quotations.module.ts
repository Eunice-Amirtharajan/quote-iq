import { Module } from '@nestjs/common';
import { QuotationsService } from './quotations.service';
import { QuotationsResolver } from './quotations.resolver';

@Module({
  providers: [QuotationsService, QuotationsResolver],
})
export class QuotationsModule {}

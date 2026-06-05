import { Module } from '@nestjs/common';
import { QuotationsService } from './quotations.service';
import { QuotationsResolver } from './quotations.resolver';
import { ClientsModule } from '../clients/clients.module';

@Module({
  providers: [QuotationsService, QuotationsResolver],
  imports: [ClientsModule],
})
export class QuotationsModule {}

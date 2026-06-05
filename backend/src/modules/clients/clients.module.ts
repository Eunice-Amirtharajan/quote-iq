import { Module } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { ClientsResolver } from './clients.resolver';

@Module({
  providers: [ClientsService, ClientsResolver],
  exports: [ClientsService],
})
export class ClientsModule {}

import { Global, Module } from '@nestjs/common';
import { TokenStoreService } from './token-store.service';

@Global()
@Module({
  providers: [TokenStoreService],
  exports: [TokenStoreService],
})
export class TokenStoreModule {}

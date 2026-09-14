import { Module } from '@nestjs/common';
import { AIService } from './ai.service';
import { AIResolver } from './ai.resolver';

@Module({
  providers: [AIService, AIResolver],
  exports: [AIService],
})
export class AIModule {}

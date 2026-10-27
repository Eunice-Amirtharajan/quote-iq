import { Module } from '@nestjs/common';
import { AIService } from './ai.service';
import { AIResolver } from './ai.resolver';
import { AiQuotaService } from './ai-quota.service';
import { AiQuotaInterceptor } from './ai-quota.interceptor';

@Module({
  providers: [AIService, AIResolver, AiQuotaService, AiQuotaInterceptor],
  exports: [AIService],
})
export class AIModule {}

import { Module } from '@nestjs/common';
import { ScoreGateway } from './score.gateway';

@Module({
  providers: [ScoreGateway],
  exports: [ScoreGateway],
})
export class GatewayModule {}

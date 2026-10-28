import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ScoreGateway } from './score.gateway';
import { SocketAuthService } from './socket-auth.service';

@Module({
  imports: [AuthModule],
  providers: [ScoreGateway, SocketAuthService],
  exports: [ScoreGateway],
})
export class GatewayModule {}

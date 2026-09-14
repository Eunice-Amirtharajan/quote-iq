import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AppLogger } from '../../common/logger/logger.service';

@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL ?? 'http://localhost:5173', credentials: true },
  namespace: '/scores',
})
export class ScoreGateway {
  @WebSocketServer()
  server: Server;

  constructor(private readonly logger: AppLogger) {}

  @SubscribeMessage('join')
  onJoin(
    @MessageBody() quotationId: string,
    @ConnectedSocket() client: Socket,
  ): void {
    void client.join(quotationId);
    this.logger.info(
      `Client ${client.id} joined room ${quotationId}`,
      ScoreGateway.name,
    );
  }

  emitScoreReady(quotationId: string, score: number, label: string): void {
    this.server.to(quotationId).emit('score.ready', { quotationId, score, label });
    this.logger.info(
      `Emitted score.ready to room ${quotationId} — score:${score} label:${label}`,
      ScoreGateway.name,
    );
  }
}

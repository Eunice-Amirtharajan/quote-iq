import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Role } from '@prisma/client';
import { Namespace, Server, Socket } from 'socket.io';
import { AppLogger } from '../../common/logger/logger.service';
import { describeError } from '../../common/helper/helper';
import { SocketAuthService, SocketUser } from './socket-auth.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
  },
  namespace: '/scores',
})
export class ScoreGateway implements OnGatewayInit {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly logger: AppLogger,
    private readonly socketAuth: SocketAuthService,
  ) {}

  /**
   * Authenticates every connection during the handshake, before it's established: a client
   * without a valid session gets a connect_error and never joins anything. Checking here rather
   * than on the first message also means a `join` can never arrive before the check finished.
   */
  afterInit(namespace: Namespace): void {
    namespace.use((socket, next) => {
      this.socketAuth
        .authenticate(socket.handshake)
        .then((user) => {
          if (!user) {
            this.logger.warn(
              `Rejected unauthenticated WebSocket connection ${socket.id}`,
              ScoreGateway.name,
            );
            return next(new Error('Unauthorized'));
          }
          (socket.data as { user?: SocketUser }).user = user;
          next();
        })
        .catch((err: unknown) => {
          this.logger.error(
            `WebSocket authentication failed for ${socket.id}`,
            describeError(err),
            ScoreGateway.name,
          );
          next(new Error('Authentication unavailable'));
        });
    });
  }

  /**
   * Joins the client to a quotation's room, so it receives that quotation's live score.
   * The score is manager-only, like the conversionScore query: anyone else is refused.
   * The return value is the acknowledgement the client receives.
   */
  @SubscribeMessage('join')
  onJoin(
    @MessageBody() quotationId: unknown,
    @ConnectedSocket() client: Socket,
  ): { joined: boolean } {
    const user = (client.data as { user?: SocketUser }).user;
    if (user?.role !== Role.SALES_MANAGER) {
      this.logger.warn(
        `Refused join from ${client.id}: user ${user?.id ?? 'unknown'} is not a sales manager`,
        ScoreGateway.name,
      );
      return { joined: false };
    }
    if (typeof quotationId !== 'string' || !UUID.test(quotationId)) {
      return { joined: false };
    }
    void client.join(quotationId);
    this.logger.info(
      `Client ${client.id} (user ${user.id}) joined room ${quotationId}`,
      ScoreGateway.name,
    );
    return { joined: true };
  }

  emitScoreReady(quotationId: string, score: number, label: string): void {
    this.server
      .to(quotationId)
      .emit('score.ready', { quotationId, score, label });
    this.logger.info(
      `Emitted score.ready to room ${quotationId} — score:${score} label:${label}`,
      ScoreGateway.name,
    );
  }
}

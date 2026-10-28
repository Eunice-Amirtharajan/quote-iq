import type { Namespace, Socket } from 'socket.io';
import { ScoreGateway } from './score.gateway';
import { AppLogger } from '../../common/logger/logger.service';
import type { SocketAuthService, SocketUser } from './socket-auth.service';

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as unknown as AppLogger;

const mockServer = {
  to: jest.fn().mockReturnThis(),
  emit: jest.fn(),
};

const mockSocketAuth = { authenticate: jest.fn() };

const QUOTATION_ID = '1b0a1c52-8d1e-4f34-9a3b-2f6f4c1e9d10';
const manager: SocketUser = { id: 'u-manager', role: 'SALES_MANAGER' };
const rep: SocketUser = { id: 'u-rep', role: 'SALES_REP' };

const socketOf = (user?: SocketUser) =>
  ({
    id: 'socket-abc',
    data: { user },
    handshake: { headers: { cookie: 'access_token=jwt' } },
    join: jest.fn().mockResolvedValue(undefined),
  }) as unknown as Socket & { join: jest.Mock };

describe('ScoreGateway', () => {
  let gateway: ScoreGateway;

  beforeEach(() => {
    jest.clearAllMocks();
    gateway = new ScoreGateway(
      mockLogger,
      mockSocketAuth as unknown as SocketAuthService,
    );
    // Simulate NestJS injecting the WebSocket server
    (gateway as unknown as { server: typeof mockServer }).server = mockServer;
  });

  describe('connection handshake (afterInit middleware)', () => {
    /** Registers the gateway's middleware and runs it for one socket. */
    const handshake = async (socket: Socket) => {
      let middleware!: (s: Socket, next: (err?: Error) => void) => void;
      gateway.afterInit({
        use: (fn: typeof middleware) => (middleware = fn),
      } as unknown as Namespace);
      return new Promise<Error | undefined>((resolve) =>
        middleware(socket, resolve),
      );
    };

    it('accepts a connection with a valid session and remembers its user', async () => {
      mockSocketAuth.authenticate.mockResolvedValue(manager);
      const socket = socketOf();

      await expect(handshake(socket)).resolves.toBeUndefined();

      expect(mockSocketAuth.authenticate).toHaveBeenCalledWith(
        socket.handshake,
      );
      expect((socket.data as { user: SocketUser }).user).toEqual(manager);
    });

    it('rejects a connection without a valid session', async () => {
      mockSocketAuth.authenticate.mockResolvedValue(null);
      const err = await handshake(socketOf());
      expect(err?.message).toBe('Unauthorized');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Rejected unauthenticated WebSocket connection socket-abc',
        ScoreGateway.name,
      );
    });

    it('rejects, and logs the cause, when authentication itself fails', async () => {
      mockSocketAuth.authenticate.mockRejectedValue(new Error('db down'));
      const err = await handshake(socketOf());
      expect(err?.message).toBe('Authentication unavailable');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'WebSocket authentication failed for socket-abc',
        expect.stringContaining('db down'),
        ScoreGateway.name,
      );
    });
  });

  describe('onJoin', () => {
    it("lets a sales manager join a quotation's room", () => {
      const socket = socketOf(manager);

      expect(gateway.onJoin(QUOTATION_ID, socket)).toEqual({ joined: true });

      expect(socket.join).toHaveBeenCalledWith(QUOTATION_ID);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining(QUOTATION_ID),
        ScoreGateway.name,
      );
    });

    it('refuses a sales rep: the score is manager-only, like the conversionScore query', () => {
      const socket = socketOf(rep);
      expect(gateway.onJoin(QUOTATION_ID, socket)).toEqual({ joined: false });
      expect(socket.join).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('user u-rep is not a sales manager'),
        ScoreGateway.name,
      );
    });

    it('refuses a socket with no authenticated user', () => {
      const socket = socketOf(undefined);
      expect(gateway.onJoin(QUOTATION_ID, socket)).toEqual({ joined: false });
      expect(socket.join).not.toHaveBeenCalled();
    });

    it.each([['q-123'], [''], [42], [{ room: QUOTATION_ID }]])(
      'refuses a room id that is not a quotation id: %p',
      (quotationId) => {
        const socket = socketOf(manager);
        expect(gateway.onJoin(quotationId, socket)).toEqual({ joined: false });
        expect(socket.join).not.toHaveBeenCalled();
      },
    );
  });

  describe('emitScoreReady', () => {
    it('emits score.ready to the quotation room with score and label', () => {
      gateway.emitScoreReady('q-456', 82, 'HIGH');

      expect(mockServer.to).toHaveBeenCalledWith('q-456');
      expect(mockServer.emit).toHaveBeenCalledWith('score.ready', {
        quotationId: 'q-456',
        score: 82,
        label: 'HIGH',
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('q-456'),
        ScoreGateway.name,
      );
    });
  });
});

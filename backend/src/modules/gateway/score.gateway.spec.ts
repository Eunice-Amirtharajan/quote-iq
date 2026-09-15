import { ScoreGateway } from './score.gateway';
import { AppLogger } from '../../common/logger/logger.service';

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as unknown as AppLogger;

const mockServer = {
  to: jest.fn().mockReturnThis(),
  emit: jest.fn(),
};

describe('ScoreGateway', () => {
  let gateway: ScoreGateway;

  beforeEach(() => {
    jest.clearAllMocks();
    gateway = new ScoreGateway(mockLogger);
    // Simulate NestJS injecting the WebSocket server
    (gateway as unknown as { server: typeof mockServer }).server = mockServer;
  });

  describe('onJoin', () => {
    it('calls client.join with the quotationId and logs', () => {
      const mockClient = {
        id: 'socket-abc',
        join: jest.fn().mockResolvedValue(undefined),
      } as unknown as import('socket.io').Socket;

      gateway.onJoin('q-123', mockClient);

      expect(mockClient.join).toHaveBeenCalledWith('q-123');
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('q-123'),
        ScoreGateway.name,
      );
    });
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

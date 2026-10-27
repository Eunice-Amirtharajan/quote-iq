import { HealthService } from './health.service';
import { HealthController } from './health.controller';

const mockPrisma = { $queryRaw: jest.fn() };
const mockAmqp = { managedConnection: { isConnected: jest.fn() } };

describe('HealthService', () => {
  let service: HealthService;

  beforeEach(() => {
    mockPrisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    mockAmqp.managedConnection.isConnected.mockReturnValue(true);
    service = new HealthService(mockPrisma as never, mockAmqp as never);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('is ready when the database and RabbitMQ are up', async () => {
    await expect(service.readiness()).resolves.toEqual({
      ready: true,
      status: 'ok',
      checks: { database: 'up', rabbitmq: 'up' },
    });
  });

  it('stays ready but degraded when only RabbitMQ is down (the outbox holds events)', async () => {
    mockAmqp.managedConnection.isConnected.mockReturnValue(false);
    await expect(service.readiness()).resolves.toEqual({
      ready: true,
      status: 'degraded',
      checks: { database: 'up', rabbitmq: 'down' },
    });
  });

  it('is not ready when the database query fails', async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error("Can't reach database"));
    await expect(service.readiness()).resolves.toEqual({
      ready: false,
      status: 'unavailable',
      checks: { database: 'down', rabbitmq: 'up' },
    });
  });

  it('is not ready when the database does not answer within 3s', async () => {
    jest.useFakeTimers();
    mockPrisma.$queryRaw.mockReturnValue(new Promise(() => undefined));

    const result = service.readiness();
    await jest.advanceTimersByTimeAsync(3_000);

    await expect(result).resolves.toMatchObject({
      ready: false,
      checks: { database: 'down' },
    });
  });

  it('is not ready once shutdown has started, without querying anything', async () => {
    service.markShuttingDown();
    await expect(service.readiness()).resolves.toEqual({
      ready: false,
      status: 'shutting_down',
      checks: {},
    });
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });
});

describe('HealthController', () => {
  const res = { status: jest.fn() };
  const health = { readiness: jest.fn() };
  const controller = new HealthController(health as never);

  it.each([
    [true, 200],
    [false, 503],
  ])('ready=%s answers %d with the status and checks', async (ready, code) => {
    const checks = { database: ready ? 'up' : 'down', rabbitmq: 'up' };
    health.readiness.mockResolvedValueOnce({ ready, status: 'x', checks });

    const body = await controller.ready(res as never);

    expect(res.status).toHaveBeenCalledWith(code);
    expect(body).toEqual({ status: 'x', checks });
  });
});

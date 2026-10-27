import { warmUpDatabase } from './warm-up';

const logger = { info: jest.fn(), warn: jest.fn() };
const fast = { attempts: 3, delayMs: 1 };

describe('warmUpDatabase', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns once the first ping succeeds', async () => {
    const ping = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
    await expect(warmUpDatabase(ping, logger, fast)).resolves.toBe(true);
    expect(ping).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringMatching(/^Database ready in \d+ms \(attempt 1\)$/),
      'DatabaseWarmUp',
    );
  });

  it('retries while the database is waking up', async () => {
    const ping = jest
      .fn()
      .mockRejectedValueOnce(new Error('Connection terminated unexpectedly'))
      .mockResolvedValue([]);
    await expect(warmUpDatabase(ping, logger, fast)).resolves.toBe(true);
    expect(ping).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      'Database not ready (attempt 1/3): Connection terminated unexpectedly',
      'DatabaseWarmUp',
    );
  });

  it('gives up without throwing after the last attempt', async () => {
    const ping = jest.fn().mockRejectedValue({ kind: 'postgres' });
    await expect(warmUpDatabase(ping, logger, fast)).resolves.toBe(false);
    expect(ping).toHaveBeenCalledTimes(3);
    expect(logger.warn).toHaveBeenLastCalledWith(
      "Database not ready (attempt 3/3): { kind: 'postgres' }",
      'DatabaseWarmUp',
    );
  });

  it('reports the cause line of a multi-line Prisma error', async () => {
    const prismaMessage = [
      '',
      'Invalid `prisma.$queryRaw()` invocation:',
      '',
      '',
      "Can't reach database server at `localhost:5433`",
    ].join('\n');
    const ping = jest.fn().mockRejectedValue(new Error(prismaMessage));
    await warmUpDatabase(ping, logger, { attempts: 1, delayMs: 1 });
    expect(logger.warn).toHaveBeenCalledWith(
      "Database not ready (attempt 1/1): Can't reach database server at `localhost:5433`",
      'DatabaseWarmUp',
    );
  });
});

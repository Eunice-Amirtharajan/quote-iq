jest.mock('ioredis');
import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { TokenStoreService } from './token-store.service';

describe('TokenStoreService (in-memory path)', () => {
  let service: TokenStoreService;
  const savedRedisUrl = process.env.REDIS_URL;

  beforeEach(async () => {
    delete process.env.REDIS_URL;
    const module: TestingModule = await Test.createTestingModule({
      providers: [TokenStoreService],
    }).compile();
    service = module.get<TokenStoreService>(TokenStoreService);
  });

  afterEach(() => {
    if (savedRedisUrl !== undefined) {
      process.env.REDIS_URL = savedRedisUrl;
    } else {
      delete process.env.REDIS_URL;
    }
  });

  it('set and get returns the stored value', async () => {
    await service.set('key1', 'val1', 60);
    const result = await service.get('key1');
    expect(result).toBe('val1');
  });

  it('get returns null for unknown key', async () => {
    const result = await service.get('missing-key');
    expect(result).toBeNull();
  });

  it('get returns null after TTL has expired', async () => {
    await service.set('expiring', 'value', 0);
    // TTL of 0 seconds means expiresAt = Date.now(), which is already expired
    jest.useFakeTimers();
    jest.advanceTimersByTime(1);
    const result = await service.get('expiring');
    jest.useRealTimers();
    expect(result).toBeNull();
  });

  it('del removes the entry', async () => {
    await service.set('to-delete', 'bye', 60);
    await service.del('to-delete');
    const result = await service.get('to-delete');
    expect(result).toBeNull();
  });

  it('del on non-existent key does not throw', async () => {
    await expect(service.del('nope')).resolves.toBeUndefined();
  });

  it('onModuleDestroy does not throw when redis is null', () => {
    expect(() => service.onModuleDestroy()).not.toThrow();
  });

  it('overwrites an existing key', async () => {
    await service.set('key', 'first', 60);
    await service.set('key', 'second', 60);
    const result = await service.get('key');
    expect(result).toBe('second');
  });
});

describe('TokenStoreService (Redis path)', () => {
  const savedRedisUrl = process.env.REDIS_URL;

  afterEach(() => {
    if (savedRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = savedRedisUrl;
    jest.restoreAllMocks();
  });

  it('logs Redis connection errors with their details, not [object Object]', () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    const logError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    new TokenStoreService();
    const redis = jest.mocked(Redis).mock.instances.at(-1) as unknown as {
      on: jest.Mock;
    };
    const [event, handler] = redis.on.mock.calls[0] as [
      string,
      (err: unknown) => void,
    ];
    expect(event).toBe('error');

    handler({ code: 'ECONNREFUSED', port: 6379 });

    expect(logError).toHaveBeenCalledWith(
      'Redis connection error',
      "{ code: 'ECONNREFUSED', port: 6379 }",
    );
  });
});

describe('TokenStoreService (Redis set but unavailable)', () => {
  const savedRedisUrl = process.env.REDIS_URL;
  type MockRedis = {
    status: string;
    on: jest.Mock;
    set: jest.Mock;
    get: jest.Mock;
    del: jest.Mock;
  };

  function create(status: string): {
    service: TokenStoreService;
    redis: MockRedis;
  } {
    process.env.REDIS_URL = 'redis://unreachable.invalid:6379';
    const service = new TokenStoreService();
    const redis = jest
      .mocked(Redis)
      .mock.instances.at(-1) as unknown as MockRedis;
    redis.status = status;
    return { service, redis };
  }

  function handler(redis: MockRedis, event: string): (arg?: unknown) => void {
    // The automock shares `on` across instances, so take this instance's (the latest) handler
    const call = redis.on.mock.calls.filter(([e]) => e === event).at(-1) as [
      string,
      (arg?: unknown) => void,
    ];
    return call[1];
  }

  let logError: jest.SpyInstance;
  let logInfo: jest.SpyInstance;

  beforeEach(() => {
    logError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    logInfo = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    if (savedRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = savedRedisUrl;
    jest.restoreAllMocks();
  });

  it('fails fast instead of queueing commands while disconnected', () => {
    create('reconnecting');
    const args = jest.mocked(Redis).mock.calls.at(-1) as unknown as [
      string,
      { enableOfflineQueue: boolean; maxRetriesPerRequest: number },
    ];
    const options = args[1];
    expect(options.enableOfflineQueue).toBe(false);
    expect(options.maxRetriesPerRequest).toBe(1);
  });

  it('stores and reads tokens in memory while Redis is down, without calling Redis', async () => {
    const { service, redis } = create('reconnecting');
    await service.set('invite:abc', 'user-1', 60);
    await expect(service.get('invite:abc')).resolves.toBe('user-1');
    expect(redis.set).not.toHaveBeenCalled();
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('uses Redis when it is ready', async () => {
    const { service, redis } = create('ready');
    redis.get.mockResolvedValue('user-2');
    await service.set('reset:xyz', 'user-2', 60);
    await expect(service.get('reset:xyz')).resolves.toBe('user-2');
    expect(redis.set).toHaveBeenCalledWith('reset:xyz', 'user-2', 'EX', 60);
  });

  it('falls back to memory when a Redis write fails', async () => {
    const { service, redis } = create('ready');
    redis.set.mockRejectedValue(new Error('Connection is closed'));
    redis.get.mockRejectedValue(new Error('Connection is closed'));
    await service.set('invite:abc', 'user-1', 60);
    await expect(service.get('invite:abc')).resolves.toBe('user-1');
  });

  it('finds a token written to memory during an outage after Redis is back', async () => {
    const { service, redis } = create('reconnecting');
    await service.set('invite:abc', 'user-1', 60);
    redis.status = 'ready';
    redis.get.mockResolvedValue(null);
    await expect(service.get('invite:abc')).resolves.toBe('user-1');
  });

  it('deletes a token from both stores', async () => {
    const { service, redis } = create('reconnecting');
    await service.set('reset:xyz', 'user-2', 60);
    redis.status = 'ready';
    redis.get.mockResolvedValue(null);
    await service.del('reset:xyz');
    expect(redis.del).toHaveBeenCalledWith('reset:xyz');
    await expect(service.get('reset:xyz')).resolves.toBeNull();
  });

  it('logs an outage once and logs the recovery', () => {
    const { redis } = create('reconnecting');
    const onError = handler(redis, 'error');
    onError(new Error('getaddrinfo ENOTFOUND'));
    onError(new Error('getaddrinfo ENOTFOUND'));
    onError(new Error('getaddrinfo ENOTFOUND'));
    expect(logError).toHaveBeenCalledTimes(1);

    handler(redis, 'ready')();
    expect(logInfo).toHaveBeenCalledWith('Redis reconnected');

    onError(new Error('ECONNRESET'));
    expect(logError).toHaveBeenCalledTimes(2);
  });
});

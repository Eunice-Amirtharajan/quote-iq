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

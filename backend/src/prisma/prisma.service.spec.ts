import { Test, TestingModule } from '@nestjs/testing';
import {
  PrismaService,
  isDbConnectionError,
  withDbRetry,
} from './prisma.service';
import { PrismaNeon } from '@prisma/adapter-neon';
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

jest.mock('@prisma/adapter-neon', () => ({
  PrismaNeon: jest.fn().mockImplementation(() => ({
    provider: 'postgres',
    adapterName: 'neon',
    connect: jest.fn(),
    startTransaction: jest.fn(),
    executeRaw: jest.fn(),
    queryRaw: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    dispose: jest.fn(),
  })),
}));

const mockLogger = { warn: jest.fn() };

describe('PrismaService — Neon URL', () => {
  let service: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();
    service = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => jest.clearAllMocks());

  it('sets neonConfig.webSocketConstructor to ws at module load', () => {
    expect(neonConfig.webSocketConstructor).toBe(ws);
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  it('disconnects on module destroy', async () => {
    const disconnectSpy = jest
      .spyOn(service, '$disconnect')
      .mockResolvedValue(undefined);
    await service.onModuleDestroy();
    expect(disconnectSpy).toHaveBeenCalled();
  });
});

describe('PrismaService — missing DATABASE_URL', () => {
  const savedUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    process.env.DATABASE_URL = savedUrl;
  });

  it('throws on construction when DATABASE_URL is not set', () => {
    expect(() => new PrismaService()).toThrow('DATABASE_URL is not set');
  });
});

describe('PrismaService — neon.database URL variant', () => {
  const savedUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    process.env.DATABASE_URL = 'postgresql://user:pass@ep-xxx.neon.database/db';
  });

  afterEach(() => {
    process.env.DATABASE_URL = savedUrl;
    jest.clearAllMocks();
  });

  it('uses Neon adapter for neon.database hostnames', async () => {
    (PrismaNeon as jest.Mock).mockClear();
    const module = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();
    const service = module.get<PrismaService>(PrismaService);
    expect(service).toBeDefined();
    expect(PrismaNeon).toHaveBeenCalled();
  });
});

describe('PrismaService — local PostgreSQL URL', () => {
  let service: PrismaService;
  const savedUrl = process.env.DATABASE_URL;

  beforeEach(async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/testdb';
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();
    service = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    process.env.DATABASE_URL = savedUrl;
    jest.clearAllMocks();
  });

  it('is defined when using local postgres URL', () => {
    expect(service).toBeDefined();
  });
});

describe('isDbConnectionError', () => {
  it('returns true for P1001 error code', () => {
    expect(isDbConnectionError({ code: 'P1001' })).toBe(true);
  });

  it('returns true for P1002 error code', () => {
    expect(isDbConnectionError({ code: 'P1002' })).toBe(true);
  });

  it('returns true for P1008 error code', () => {
    expect(isDbConnectionError({ code: 'P1008' })).toBe(true);
  });

  it('returns true for P1017 error code', () => {
    expect(isDbConnectionError({ code: 'P1017' })).toBe(true);
  });

  it("returns true for message containing \"Can't reach database\"", () => {
    expect(
      isDbConnectionError({ message: "Can't reach database server" }),
    ).toBe(true);
  });

  it('returns true for message containing "Connection refused"', () => {
    expect(isDbConnectionError({ message: 'Connection refused' })).toBe(true);
  });

  it('returns true for message containing "ECONNREFUSED"', () => {
    expect(
      isDbConnectionError({ message: 'connect ECONNREFUSED 127.0.0.1:5432' }),
    ).toBe(true);
  });

  it('returns false for unrelated error codes', () => {
    expect(isDbConnectionError({ code: 'P2002' })).toBe(false);
  });

  it('returns false for unrelated error messages', () => {
    expect(isDbConnectionError({ message: 'Unique constraint failed' })).toBe(
      false,
    );
  });

  it('returns false for non-object errors', () => {
    expect(isDbConnectionError(null)).toBe(false);
    expect(isDbConnectionError('string error')).toBe(false);
  });
});

describe('withDbRetry', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns result immediately on success', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await withDbRetry(fn, mockLogger);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on connection error and succeeds on second attempt', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce({ code: 'P1001', message: "Can't reach database" })
      .mockResolvedValue('ok');

    const result = await withDbRetry(fn, mockLogger, 3, 0);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('attempt 1/3'),
    );
  });

  it('throws immediately on non-connection error', async () => {
    const fn = jest
      .fn()
      .mockRejectedValue(new Error('Unique constraint failed'));
    await expect(withDbRetry(fn, mockLogger, 3, 0)).rejects.toThrow(
      'Unique constraint failed',
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws after exhausting all retries', async () => {
    const fn = jest
      .fn()
      .mockRejectedValue({ code: 'P1001', message: "Can't reach database" });
    await expect(withDbRetry(fn, mockLogger, 3, 0)).rejects.toMatchObject({
      code: 'P1001',
    });
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

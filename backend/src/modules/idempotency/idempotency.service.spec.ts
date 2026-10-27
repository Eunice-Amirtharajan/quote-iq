import { BadRequestException } from '@nestjs/common';
import { IdempotencyService } from './idempotency.service';

const mockPrisma = {
  idempotencyKey: {
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
};
const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
const scope = {
  userId: 'u-1',
  operation: 'createQuotation',
  key: 'a8f5f167-0e8b-4d3c-9f0a-5c2b1e7d4a91',
  requestHash: 'hash-1',
};
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('IdempotencyService', () => {
  let service: IdempotencyService;

  beforeEach(() => {
    service = new IdempotencyService(mockPrisma as never, mockLogger as never);
  });
  afterEach(() => jest.clearAllMocks());

  describe('parseKey', () => {
    it('returns undefined when no key is sent', () => {
      expect(service.parseKey(undefined)).toBeUndefined();
      expect(service.parseKey('')).toBeUndefined();
    });

    it('accepts a UUID and takes the first value of a repeated header', () => {
      expect(service.parseKey(scope.key)).toBe(scope.key);
      expect(service.parseKey([scope.key, 'other-key-123'])).toBe(scope.key);
    });

    it.each([
      ['too short', 'abc'],
      ['contains a space', 'abcd efgh'],
      ['too long', 'x'.repeat(256)],
      ['non-ASCII', 'schlüssel-1234'],
    ])('rejects a key that is %s', (_label, key) => {
      expect(() => service.parseKey(key)).toThrow(BadRequestException);
    });
  });

  describe('hashRequest', () => {
    it('ignores property order at every level', () => {
      const a = { title: 'T', items: [{ q: 1, d: 'x' }], taxRate: 19 };
      const b = { taxRate: 19, items: [{ d: 'x', q: 1 }], title: 'T' };
      expect(service.hashRequest(a)).toBe(service.hashRequest(b));
    });

    it('treats a missing field and an undefined field alike', () => {
      expect(service.hashRequest({ title: 'T', notes: undefined })).toBe(
        service.hashRequest({ title: 'T' }),
      );
    });

    it('changes when a value or the item order changes', () => {
      const base = service.hashRequest({ title: 'T', items: [1, 2] });
      expect(service.hashRequest({ title: 'U', items: [1, 2] })).not.toBe(base);
      expect(service.hashRequest({ title: 'T', items: [2, 1] })).not.toBe(base);
    });

    it('keeps the exact hash format, so keys stored before a deploy still match after it', () => {
      expect(
        service.hashRequest({
          title: 'T',
          b: [1, { z: null, a: 'x' }],
          notes: undefined,
          é: 2,
          A: true,
        }),
      ).toBe(
        'cb3bd7769b72cd5885f49bc218fe1dd5773193df1acb7fa91181a1c0e456bf20',
      );
    });

    it('distinguishes null from a missing field', () => {
      expect(service.hashRequest({ notes: null })).not.toBe(
        service.hashRequest({}),
      );
    });
  });

  describe('findResource', () => {
    it('looks the key up per user and operation', async () => {
      await service.findResource(scope);
      expect(mockPrisma.idempotencyKey.findUnique).toHaveBeenCalledWith({
        where: {
          userId_operation_key: {
            userId: 'u-1',
            operation: 'createQuotation',
            key: scope.key,
          },
        },
      });
    });
  });

  describe('record', () => {
    it('writes the key with the caller transaction and a 24h expiry', async () => {
      const tx = {
        idempotencyKey: { create: jest.fn().mockResolvedValue({}) },
      };
      const before = Date.now();
      await service.record(tx as never, scope, 'q-1');
      const data = tx.idempotencyKey.create.mock.calls[0][0].data;
      expect(data).toEqual(
        expect.objectContaining({ ...scope, resourceId: 'q-1' }),
      );
      expect(data.expiresAt.getTime() - before).toBeGreaterThanOrEqual(
        24 * 3600_000,
      );
      expect(mockPrisma.idempotencyKey.create).not.toHaveBeenCalled();
    });
  });

  describe('cleanup of expired keys', () => {
    it('runs at most once an hour and logs what it removed', async () => {
      mockPrisma.idempotencyKey.deleteMany.mockResolvedValueOnce({ count: 3 });
      await service.findResource(scope);
      await service.findResource(scope);
      await flush();
      expect(mockPrisma.idempotencyKey.deleteMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.idempotencyKey.deleteMany).toHaveBeenCalledWith({
        where: { expiresAt: { lt: expect.any(Date) } },
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Idempotency cleanup removed 3 expired keys',
        IdempotencyService.name,
      );
    });

    it('never fails the request when cleanup fails', async () => {
      mockPrisma.idempotencyKey.deleteMany.mockRejectedValueOnce(
        new Error('db busy'),
      );
      await expect(service.findResource(scope)).resolves.toBeNull();
      await flush();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Idempotency cleanup failed: db busy',
        IdempotencyService.name,
      );
    });

    it('logs a non-Error cleanup failure as text', async () => {
      mockPrisma.idempotencyKey.deleteMany.mockRejectedValueOnce('timeout');
      await service.findResource(scope);
      await flush();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Idempotency cleanup failed: timeout',
        IdempotencyService.name,
      );
    });
  });
});

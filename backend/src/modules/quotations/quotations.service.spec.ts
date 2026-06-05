import { Test, TestingModule } from '@nestjs/testing';
import { QuotationsService } from './quotations.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AppLogger } from '../../common/logger/logger.service';
import { Role, User } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { QuotationStatus } from '@prisma/client';

const mockPrismaService = {
  quotation: {
    count: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  statusHistory: {
    create: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

describe('QuotationsService', () => {
  let service: QuotationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotationsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AppLogger, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<QuotationsService>(QuotationsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('calculateTotals', () => {
    it('calculates subtotal correctly from multiple line items', () => {
      const result = service['calculateTotals'](
        [
          { description: 'Item A', quantity: 2, unitPrice: 100 },
          { description: 'Item B', quantity: 1, unitPrice: 500 },
        ],
        0,
      );
      expect(result.subtotal).toBe(700);
    });

    it('calculates lineTotal for each item', () => {
      const result = service['calculateTotals'](
        [{ description: 'Item', quantity: 3, unitPrice: 250 }],
        0,
      );
      expect(result.itemsWithTotal[0].lineTotal).toBe(750);
    });

    it('calculates tax amount correctly', () => {
      const result = service['calculateTotals'](
        [{ description: 'Item', quantity: 1, unitPrice: 1000 }],
        19,
      );
      expect(result.taxAmount).toBe(190);
    });

    it('calculates total as subtotal + tax', () => {
      const result = service['calculateTotals'](
        [{ description: 'Item', quantity: 1, unitPrice: 1000 }],
        19,
      );
      expect(result.total).toBe(1190);
    });

    it('handles zero tax rate', () => {
      const result = service['calculateTotals'](
        [{ description: 'Item', quantity: 1, unitPrice: 5000 }],
        0,
      );
      expect(result.taxAmount).toBe(0);
      expect(result.total).toBe(5000);
    });

    it('rounds to 2 decimal places', () => {
      const result = service['calculateTotals'](
        [{ description: 'Item', quantity: 3, unitPrice: 33.33 }],
        0,
      );
      expect(result.itemsWithTotal[0].lineTotal).toBe(99.99);
    });
  });

  describe('findAll', () => {
    const mockUser = (role: Role): User => ({
      id: 'user-1',
      email: 'test@test.com',
      role,
      name: 'Test',
      password: 'hash',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    it('fetches all quotations for SALES_MANAGER', async () => {
      mockPrismaService.quotation.findMany.mockResolvedValue([]);
      await service.findAll(mockUser(Role.SALES_MANAGER));
      expect(mockPrismaService.quotation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it('fetches all quotations for ADMIN', async () => {
      mockPrismaService.quotation.findMany.mockResolvedValue([]);
      await service.findAll(mockUser(Role.ADMIN));
      expect(mockPrismaService.quotation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it('fetches only own quotations for SALES_REP', async () => {
      mockPrismaService.quotation.findMany.mockResolvedValue([]);
      await service.findAll(mockUser(Role.SALES_REP));
      expect(mockPrismaService.quotation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { createdById: 'user-1' } }),
      );
    });
    it('throws and logs error when prisma fails', async () => {
      mockPrismaService.quotation.findMany.mockRejectedValue(
        new Error('DB error'),
      );

      await expect(
        service.findAll(mockUser(Role.SALES_MANAGER)),
      ).rejects.toThrow('DB error');

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('returns quotation when found', async () => {
      const mockQuotation = { id: 'q-1', title: 'Test' };
      mockPrismaService.quotation.findUnique.mockResolvedValue(mockQuotation);
      const result = await service.findOne('q-1');
      expect(result).toEqual(mockQuotation);
    });

    it('returns null when not found', async () => {
      mockPrismaService.quotation.findUnique.mockResolvedValue(null);
      const result = await service.findOne('q-999');
      expect(result).toBeNull();
    });
    it('throws and logs error when prisma fails', async () => {
      mockPrismaService.quotation.findUnique.mockRejectedValue(
        new Error('DB error'),
      );

      await expect(service.findOne('q-1')).rejects.toThrow('DB error');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('returns true on successful delete', async () => {
      mockPrismaService.quotation.delete.mockResolvedValue({});
      const result = await service.delete('q-1');
      expect(result).toBe(true);
    });

    it('throws when prisma throws', async () => {
      mockPrismaService.quotation.delete.mockRejectedValue(
        new Error('DB error'),
      );
      await expect(service.delete('q-1')).rejects.toThrow('DB error');
    });
  });

  describe('create', () => {
    const mockUser: User = {
      id: 'user-1',
      email: 'anna@quoteiq.com',
      name: 'Anna',
      password: 'hash',
      role: Role.SALES_REP,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockInput = {
      title: 'Enterprise License',
      clientId: 'c-1',
      taxRate: 19,
      notes: 'Annual license',
      validUntil: new Date(),
      items: [
        { description: 'Software License', quantity: 1, unitPrice: 5000 },
        { description: 'Support Package', quantity: 2, unitPrice: 500 },
      ],
    };

    let mockTxCreate: jest.Mock;

    beforeEach(() => {
      mockTxCreate = jest.fn();
      mockPrismaService.$transaction.mockImplementation(
        async (cb: (tx: object) => Promise<object>) =>
          cb({
            $queryRaw: jest.fn().mockResolvedValue([{ nextval: BigInt(1) }]),
            quotation: { create: mockTxCreate },
          }),
      );
    });

    it('generates correct quotation number', async () => {
      mockTxCreate.mockResolvedValue({ id: 'q-1' });
      await service.create(mockInput, mockUser);
      expect(mockTxCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            quotationNumber: `QT-${new Date().getFullYear()}-0001`,
          }),
        }),
      );
    });

    it('calculates correct totals from line items', async () => {
      mockTxCreate.mockResolvedValue({ id: 'q-1' });
      await service.create(mockInput, mockUser);
      expect(mockTxCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            subtotal: 6000,
            taxAmount: 1140,
            total: 7140,
          }),
        }),
      );
    });

    it('sets createdById from user', async () => {
      mockTxCreate.mockResolvedValue({ id: 'q-1' });
      await service.create(mockInput, mockUser);
      expect(mockTxCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ createdById: 'user-1' }),
        }),
      );
    });

    it('defaults taxRate to 0 when not provided', async () => {
      mockTxCreate.mockResolvedValue({ id: 'q-1' });
      const inputWithoutTax = { ...mockInput, taxRate: undefined };
      await service.create(inputWithoutTax, mockUser);
      expect(mockTxCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ taxRate: 0, taxAmount: 0 }),
        }),
      );
    });

    it('throws and logs error when prisma fails', async () => {
      mockPrismaService.$transaction.mockRejectedValue(new Error('DB error'));

      await expect(service.create(mockInput, mockUser)).rejects.toThrow(
        'DB error',
      );
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    const existingQuotation = {
      id: 'q-1',
      status: QuotationStatus.DRAFT,
      title: 'Test',
      total: 5000,
    };

    type MockTx = {
      quotation: {
        findUnique: jest.Mock;
        update: jest.Mock;
      };
      statusHistory: { create: jest.Mock };
    };

    const makeTx = (findResult: unknown, updateResult: unknown): MockTx => ({
      quotation: {
        findUnique: jest.fn().mockResolvedValue(findResult),
        update: jest.fn().mockResolvedValue(updateResult),
      },
      statusHistory: { create: jest.fn().mockResolvedValue({}) },
    });

    const runWithTx = (tx: MockTx) =>
      mockPrismaService.$transaction.mockImplementation(
        (cb: (tx: MockTx) => Promise<unknown>) => cb(tx),
      );

    it('records status history and updates quotation', async () => {
      const updatedQuotation = {
        ...existingQuotation,
        status: QuotationStatus.SENT,
      };
      const tx = makeTx(existingQuotation, updatedQuotation);
      runWithTx(tx);

      await service.updateStatus('q-1', 'SENT', 'Sending to client', 'user-1');

      expect(mockPrismaService.$transaction).toHaveBeenCalled();
      expect(tx.statusHistory.create).toHaveBeenCalled();
    });

    it('updates quotation status correctly', async () => {
      const updatedQuotation = {
        ...existingQuotation,
        status: QuotationStatus.SENT,
      };
      const tx = makeTx(existingQuotation, updatedQuotation);
      runWithTx(tx);

      const result = await service.updateStatus(
        'q-1',
        'SENT',
        undefined,
        'user-1',
      );

      expect(result).toMatchObject({ status: QuotationStatus.SENT });
    });

    it('throws NotFoundException when quotation not found', async () => {
      const tx = makeTx(null, null);
      runWithTx(tx);

      await expect(
        service.updateStatus('q-999', 'SENT', undefined, 'user-1'),
      ).rejects.toThrow(NotFoundException);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('q-999'),
        QuotationsService.name,
      );
    });

    it('throws when prisma transaction fails', async () => {
      mockPrismaService.$transaction.mockRejectedValue(new Error('DB error'));

      await expect(
        service.updateStatus('q-1', 'SENT', undefined, 'user-1'),
      ).rejects.toThrow('DB error');

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});

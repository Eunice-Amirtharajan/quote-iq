import { Test, TestingModule } from '@nestjs/testing';
import { QuotationsService } from './quotations.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AppLogger } from '../../common/logger/logger.service';
import { Role, User } from '@prisma/client';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { QuotationStatus } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

const mockPrismaService = {
  quotation: {
    count: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  statusHistory: {
    create: jest.fn(),
  },
  $transaction: jest.fn(),
  $queryRaw: jest.fn(),
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
    it('applies status filter when provided', async () => {
      mockPrismaService.quotation.findMany.mockResolvedValue([]);
      await service.findAll(mockUser(Role.SALES_MANAGER), 20, 0, {
        status: QuotationStatus.SENT,
      });
      expect(mockPrismaService.quotation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: QuotationStatus.SENT }),
        }),
      );
    });

    it('applies search filter across title, quotationNumber, and client name', async () => {
      mockPrismaService.quotation.findMany.mockResolvedValue([]);
      await service.findAll(mockUser(Role.SALES_MANAGER), 20, 0, {
        search: 'enterprise',
      });
      expect(mockPrismaService.quotation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({
                title: expect.objectContaining({ contains: 'enterprise' }),
              }),
            ]),
          }),
        }),
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
      mockPrismaService.quotation.findFirst.mockResolvedValue(mockQuotation);
      const result = await service.findOne('q-1');
      expect(result).toEqual(mockQuotation);
    });

    it('returns null when not found', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue(null);
      const result = await service.findOne('q-999');
      expect(result).toBeNull();
    });
    it('throws and logs error when prisma fails', async () => {
      mockPrismaService.quotation.findFirst.mockRejectedValue(
        new Error('DB error'),
      );

      await expect(service.findOne('q-1')).rejects.toThrow('DB error');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('findOwner', () => {
    it('returns createdById when quotation exists', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue({
        createdById: 'user-1',
      });
      const result = await service.findOwner('q-1');
      expect(result).toEqual({ createdById: 'user-1' });
      expect(mockPrismaService.quotation.findFirst).toHaveBeenCalledWith({
        where: { id: 'q-1' },
        select: { createdById: true },
      });
    });

    it('returns null when quotation does not exist', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue(null);
      const result = await service.findOwner('q-999');
      expect(result).toBeNull();
    });

    it('throws and logs error when prisma fails', async () => {
      mockPrismaService.quotation.findFirst.mockRejectedValue(
        new Error('DB error'),
      );
      await expect(service.findOwner('q-1')).rejects.toThrow('DB error');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('returns true on successful delete', async () => {
      mockPrismaService.quotation.delete.mockResolvedValue({});
      const result = await service.delete('q-1');
      expect(result).toBe(true);
    });

    it('throws NotFoundException when quotation does not exist (P2025)', async () => {
      const p2025 = new PrismaClientKnownRequestError('Not found', {
        code: 'P2025',
        clientVersion: '0',
      });
      mockPrismaService.quotation.delete.mockRejectedValue(p2025);
      await expect(service.delete('q-999')).rejects.toThrow(NotFoundException);
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('throws and logs error for unexpected prisma failure', async () => {
      mockPrismaService.quotation.delete.mockRejectedValue(
        new Error('DB error'),
      );
      await expect(service.delete('q-1')).rejects.toThrow('DB error');
      expect(mockLogger.error).toHaveBeenCalled();
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

    beforeEach(() => {
      mockPrismaService.$queryRaw = jest
        .fn()
        .mockResolvedValue([{ nextval: BigInt(1) }]);
    });

    it('generates correct quotation number', async () => {
      mockPrismaService.quotation.create.mockResolvedValue({ id: 'q-1' });
      await service.create(mockInput, mockUser);
      expect(mockPrismaService.quotation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            quotationNumber: `QT-${new Date().getFullYear()}-0001`,
          }),
        }),
      );
    });

    it('calculates correct totals from line items', async () => {
      mockPrismaService.quotation.create.mockResolvedValue({ id: 'q-1' });
      await service.create(mockInput, mockUser);
      expect(mockPrismaService.quotation.create).toHaveBeenCalledWith(
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
      mockPrismaService.quotation.create.mockResolvedValue({ id: 'q-1' });
      await service.create(mockInput, mockUser);
      expect(mockPrismaService.quotation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ createdById: 'user-1' }),
        }),
      );
    });

    it('defaults taxRate to 0 when not provided', async () => {
      mockPrismaService.quotation.create.mockResolvedValue({ id: 'q-1' });
      const inputWithoutTax = { ...mockInput, taxRate: undefined };
      await service.create(inputWithoutTax, mockUser);
      expect(mockPrismaService.quotation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ taxRate: 0, taxAmount: 0 }),
        }),
      );
    });

    it('throws and logs error when prisma fails', async () => {
      mockPrismaService.quotation.create.mockRejectedValue(new Error('DB error'));
      await expect(service.create(mockInput, mockUser)).rejects.toThrow('DB error');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    const draftQuotation = { id: 'q-1', status: QuotationStatus.DRAFT, title: 'Test', total: 5000 };
    const sentQuotation = { ...draftQuotation, status: QuotationStatus.SENT };
    const approvedQuotation = { ...draftQuotation, status: QuotationStatus.APPROVED };

    it('records status history and updates quotation', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue(draftQuotation);
      mockPrismaService.statusHistory.create.mockResolvedValue({});
      mockPrismaService.quotation.update.mockResolvedValue(sentQuotation);

      await service.updateStatus('q-1', 'SENT', 'Sending to client', 'user-1', Role.SALES_REP);

      expect(mockPrismaService.statusHistory.create).toHaveBeenCalled();
      expect(mockPrismaService.quotation.update).toHaveBeenCalled();
    });

    it('updates quotation status correctly', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue(draftQuotation);
      mockPrismaService.statusHistory.create.mockResolvedValue({});
      mockPrismaService.quotation.update.mockResolvedValue(sentQuotation);

      const result = await service.updateStatus('q-1', 'SENT', undefined, 'user-1', Role.SALES_REP);

      expect(result).toMatchObject({ status: QuotationStatus.SENT });
    });

    it('throws NotFoundException when quotation not found', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue(null);

      await expect(
        service.updateStatus('q-999', 'SENT', undefined, 'user-1', Role.SALES_REP),
      ).rejects.toThrow(NotFoundException);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('q-999'),
        QuotationsService.name,
      );
    });

    it('throws ForbiddenException when SALES_REP tries to APPROVE', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue(sentQuotation);

      await expect(
        service.updateStatus('q-1', QuotationStatus.APPROVED, undefined, 'user-1', Role.SALES_REP),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrismaService.quotation.update).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when SALES_REP tries to REJECT', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue(sentQuotation);

      await expect(
        service.updateStatus('q-1', QuotationStatus.REJECTED, undefined, 'user-1', Role.SALES_REP),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrismaService.quotation.update).not.toHaveBeenCalled();
    });

    it('allows SALES_MANAGER to APPROVE', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue(sentQuotation);
      mockPrismaService.statusHistory.create.mockResolvedValue({});
      mockPrismaService.quotation.update.mockResolvedValue(approvedQuotation);

      const result = await service.updateStatus(
        'q-1', QuotationStatus.APPROVED, undefined, 'manager-1', Role.SALES_MANAGER,
      );
      expect(result).toMatchObject({ status: QuotationStatus.APPROVED });
    });

    it('throws BadRequestException on illegal status transition', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue(approvedQuotation);

      await expect(
        service.updateStatus('q-1', QuotationStatus.SENT, undefined, 'user-1', Role.SALES_REP),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.quotation.update).not.toHaveBeenCalled();
    });

    it('does not log error for domain exceptions (NotFoundException)', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue(null);

      await expect(
        service.updateStatus('q-999', QuotationStatus.SENT, undefined, 'user-1', Role.SALES_REP),
      ).rejects.toThrow(NotFoundException);
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('throws when prisma findFirst fails', async () => {
      mockPrismaService.quotation.findFirst.mockRejectedValue(new Error('DB error'));

      await expect(
        service.updateStatus('q-1', 'SENT', undefined, 'user-1', Role.SALES_REP),
      ).rejects.toThrow('DB error');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('logs String(error) when a non-Error is thrown', async () => {
      mockPrismaService.quotation.findFirst.mockRejectedValue('plain string error');
      await expect(
        service.updateStatus('q-1', 'SENT', undefined, 'user-1', Role.SALES_REP),
      ).rejects.toBe('plain string error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(String),
        'plain string error',
        QuotationsService.name,
      );
    });
  });

  describe('non-Error throws (branch coverage for String(error) path)', () => {
    const mockUser: User = {
      id: 'user-1',
      email: 'anna@quoteiq.com',
      name: 'Anna',
      password: 'hash',
      role: Role.SALES_REP,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('findAll logs String(error) when non-Error is thrown', async () => {
      mockPrismaService.quotation.findMany.mockRejectedValue(
        'plain string error',
      );
      await expect(service.findAll(mockUser)).rejects.toBe(
        'plain string error',
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(String),
        'plain string error',
        QuotationsService.name,
      );
    });

    it('findOwner logs String(error) when non-Error is thrown', async () => {
      mockPrismaService.quotation.findFirst.mockRejectedValue(
        'plain string error',
      );
      await expect(service.findOwner('q-1')).rejects.toBe('plain string error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(String),
        'plain string error',
        QuotationsService.name,
      );
    });

    it('findOne logs String(error) when non-Error is thrown', async () => {
      mockPrismaService.quotation.findFirst.mockRejectedValue(
        'plain string error',
      );
      await expect(service.findOne('q-1')).rejects.toBe('plain string error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(String),
        'plain string error',
        QuotationsService.name,
      );
    });

    it('create logs String(error) when non-Error is thrown', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([{ nextval: BigInt(1) }]);
      mockPrismaService.quotation.create.mockRejectedValue('plain string error');
      await expect(
        service.create(
          {
            title: 'T',
            clientId: 'c-1',
            taxRate: 0,
            items: [{ description: 'X', quantity: 1, unitPrice: 10 }],
          },
          mockUser,
        ),
      ).rejects.toBe('plain string error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(String),
        'plain string error',
        QuotationsService.name,
      );
    });

    it('delete logs String(error) when non-Error is thrown', async () => {
      mockPrismaService.quotation.delete.mockRejectedValue(
        'plain string error',
      );
      await expect(service.delete('q-1')).rejects.toBe('plain string error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(String),
        'plain string error',
        QuotationsService.name,
      );
    });
  });
});

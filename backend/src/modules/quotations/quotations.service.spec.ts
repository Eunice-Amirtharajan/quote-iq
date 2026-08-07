import { Test, TestingModule } from '@nestjs/testing';
import { QuotationsService } from './quotations.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AppLogger } from '../../common/logger/logger.service';
import { MailService } from '../../common/mail/mail.service';
import { Role, User, QuotationStatus } from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

const mockPrismaService = {
  quotation: {
    count: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  },
  quotationItem: {
    findMany: jest.fn(),
  },
  statusHistory: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  aIInsight: {
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  user: {
    findMany: jest.fn(),
  },
  $queryRaw: jest.fn(),
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

const mockMailService = {
  sendMail: jest.fn(),
};

describe('QuotationsService', () => {
  let service: QuotationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotationsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AppLogger, useValue: mockLogger },
        { provide: MailService, useValue: mockMailService },
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

    it('applies search filter across title, quotationNumber, and clientName', async () => {
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

    it('applies repId filter when manager specifies a rep', async () => {
      const repUuid = '11111111-1111-1111-1111-111111111111';
      mockPrismaService.quotation.findMany.mockResolvedValue([]);
      await service.findAll(mockUser(Role.SALES_MANAGER), 20, 0, {
        repId: repUuid,
      });
      expect(mockPrismaService.quotation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ createdById: repUuid }),
        }),
      );
    });

    it('throws BadRequestException when repId is not a valid UUID', async () => {
      await expect(
        service.findAll(mockUser(Role.SALES_MANAGER), 20, 0, {
          repId: 'not-a-uuid',
        }),
      ).rejects.toThrow('repId must be a valid UUID');
    });

    it('ignores repId filter for SALES_REP — always scoped to own quotations', async () => {
      const otherUuid = '22222222-2222-2222-2222-222222222222';
      mockPrismaService.quotation.findMany.mockResolvedValue([]);
      await service.findAll(mockUser(Role.SALES_REP), 20, 0, {
        repId: otherUuid,
      });
      expect(mockPrismaService.quotation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ createdById: 'user-1' }),
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

  describe('findByToken', () => {
    it('returns quotation when found', async () => {
      const mockQuotation = {
        quotationNumber: 'q-1',
        title: 'Test',
        clientName: 'Client',
        status: 'DRAFT',
        notes: 'Some notes',
        taxRate: 10,
        subtotal: 100,
        taxAmount: 10,
        total: 110,
        items: {
          select: {
            quotationId: 'q-1',
            id: 'item-1',
            description: 'Item description',
            quantity: 2,
            unitPrice: 50,
            lineTotal: 100,
            sortOrder: 1,
          },
        },
      };
      mockPrismaService.quotation.findFirst.mockResolvedValue(mockQuotation);
      const result = await service.findByToken('token-1');
      expect(result).toEqual(mockQuotation);
    });

    it('returns null when not found', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue(null);
      const result = await service.findByToken('token-999');
      expect(result).toBeNull();
    });

    it('throws and logs error when prisma fails', async () => {
      mockPrismaService.quotation.findFirst.mockRejectedValue(
        new Error('DB error'),
      );
      await expect(service.findByToken('token-1')).rejects.toThrow('DB error');
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
    const mockDraft = { status: QuotationStatus.DRAFT, createdById: 'user-1' };

    it('returns true when creator deletes their own DRAFT', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue(mockDraft);
      mockPrismaService.quotation.delete.mockResolvedValue({});
      const result = await service.delete('q-1', 'user-1');
      expect(result).toBe(true);
    });

    it('throws NotFoundException when quotation does not exist', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue(null);
      await expect(service.delete('q-999', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when status is not DRAFT', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue({
        status: QuotationStatus.SENT,
        createdById: 'user-1',
      });
      await expect(service.delete('q-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws ForbiddenException when user is not the creator', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue(mockDraft);
      await expect(service.delete('q-1', 'other-user')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws NotFoundException on P2025 from delete call', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue(mockDraft);
      const p2025 = new PrismaClientKnownRequestError('Not found', {
        code: 'P2025',
        clientVersion: '0',
      });
      mockPrismaService.quotation.delete.mockRejectedValue(p2025);
      await expect(service.delete('q-1', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('throws and logs error for unexpected prisma failure', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue(mockDraft);
      mockPrismaService.quotation.delete.mockRejectedValue(
        new Error('DB error'),
      );
      await expect(service.delete('q-1', 'user-1')).rejects.toThrow('DB error');
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

    const validItem = {
      description: 'Software License',
      quantity: 1,
      unitPrice: 5000,
      sortOrder: 0,
    };

    const mockInput = {
      title: 'Enterprise License',
      clientName: 'Hans Bauer',
      taxRate: 19,
      notes: 'Annual license',
      items: [
        validItem,
        {
          description: 'Support Package',
          quantity: 2,
          unitPrice: 500,
          sortOrder: 1,
        },
      ],
    };

    const mockCreatedQuotation = {
      id: 'q-1',
      title: 'Enterprise License',
      items: [],
      client: {},
      createdBy: {},
    };

    beforeEach(() => {
      mockPrismaService.$queryRaw = jest
        .fn()
        .mockResolvedValue([{ nextval: BigInt(1) }]);
      mockPrismaService.quotation.create.mockResolvedValue(
        mockCreatedQuotation,
      );
      mockPrismaService.statusHistory.create.mockResolvedValue({});
    });

    it('generates correct quotation number', async () => {
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
      await service.create(mockInput, mockUser);
      expect(mockPrismaService.quotation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ createdById: 'user-1' }),
        }),
      );
    });

    it('defaults taxRate to 0 when not provided', async () => {
      const inputWithoutTax = { ...mockInput, taxRate: undefined };
      await service.create(inputWithoutTax, mockUser);
      expect(mockPrismaService.quotation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ taxRate: 0, taxAmount: 0 }),
        }),
      );
    });

    it('passes items as nested create with correct sortOrder', async () => {
      await service.create(mockInput, mockUser);
      expect(mockPrismaService.quotation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            items: {
              create: expect.arrayContaining([
                expect.objectContaining({ sortOrder: 0 }),
                expect.objectContaining({ sortOrder: 1 }),
              ]),
            },
          }),
        }),
      );
    });

    it('returns the quotation returned by prisma create', async () => {
      const result = await service.create(mockInput, mockUser);
      expect(result).toEqual(mockCreatedQuotation);
    });

    it('writes a DRAFT→DRAFT status history entry nested in create', async () => {
      await service.create(mockInput, mockUser);
      expect(mockPrismaService.quotation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            statusHistory: {
              create: expect.objectContaining({
                fromStatus: 'DRAFT',
                toStatus: 'DRAFT',
                changedById: mockUser.id,
              }),
            },
          }),
        }),
      );
    });

    it('throws and logs error when prisma create fails', async () => {
      mockPrismaService.quotation.create.mockRejectedValue(
        new Error('DB error'),
      );
      await expect(service.create(mockInput, mockUser)).rejects.toThrow(
        'DB error',
      );
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('throws BadRequestException when clientName contains only HTML tags', async () => {
      await expect(
        service.create({ ...mockInput, clientName: '<b></b>' }, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when clientName exceeds 200 characters', async () => {
      await expect(
        service.create({ ...mockInput, clientName: 'A'.repeat(201) }, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('strips HTML tags from clientName before saving', async () => {
      await service.create(
        { ...mockInput, clientName: '<b>Hans Bauer</b>' },
        mockUser,
      );
      expect(mockPrismaService.quotation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ clientName: 'Hans Bauer' }),
        }),
      );
    });

    it('throws BadRequestException when title is empty after strip', async () => {
      await expect(
        service.create({ ...mockInput, title: '<b></b>' }, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when title exceeds 100 characters', async () => {
      await expect(
        service.create({ ...mockInput, title: 'A'.repeat(101) }, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when taxRate is negative', async () => {
      await expect(
        service.create({ ...mockInput, taxRate: -1 }, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when taxRate exceeds 100', async () => {
      await expect(
        service.create({ ...mockInput, taxRate: 101 }, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when item description is empty after strip', async () => {
      await expect(
        service.create(
          {
            ...mockInput,
            items: [
              {
                description: '<b></b>',
                quantity: 1,
                unitPrice: 10,
                sortOrder: 0,
              },
            ],
          },
          mockUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when item description exceeds 200 characters', async () => {
      await expect(
        service.create(
          {
            ...mockInput,
            items: [
              {
                description: 'A'.repeat(201),
                quantity: 1,
                unitPrice: 10,
                sortOrder: 0,
              },
            ],
          },
          mockUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when item quantity is zero', async () => {
      await expect(
        service.create(
          {
            ...mockInput,
            items: [
              { description: 'Item', quantity: 0, unitPrice: 10, sortOrder: 0 },
            ],
          },
          mockUser,
        ),
      ).rejects.toThrow('Item quantity must be greater than 0');
    });

    it('throws BadRequestException when item unitPrice is zero', async () => {
      await expect(
        service.create(
          {
            ...mockInput,
            items: [
              { description: 'Item', quantity: 1, unitPrice: 0, sortOrder: 0 },
            ],
          },
          mockUser,
        ),
      ).rejects.toThrow('Item unit price must be greater than 0');
    });
  });

  describe('updateStatus', () => {
    const createdBy = { name: 'Anna', email: 'anna@quoteiq.com' };

    const draftQuotation = {
      id: 'q-1',
      quotationNumber: 'QT-2026-0001',
      clientName: 'Acme Corp',
      status: QuotationStatus.DRAFT,
      title: 'Test',
      total: 5000,
      createdBy,
    };
    const sentQuotation = { ...draftQuotation, status: QuotationStatus.SENT };
    const approvedQuotation = {
      ...draftQuotation,
      status: QuotationStatus.APPROVED,
    };

    const richQuotation = {
      id: 'q-1',
      quotationNumber: 'QT-2026-0001',
      clientName: 'Acme Corp',
      status: QuotationStatus.SENT,
      createdBy,
    };

    beforeEach(() => {
      // default: no managers found — existing tests that don't assert on email still pass
      mockPrismaService.user.findMany.mockResolvedValue([]);
    });

    it('records status history and updates quotation', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue(draftQuotation);
      mockPrismaService.statusHistory.create.mockResolvedValue({});
      mockPrismaService.quotation.update.mockResolvedValue(sentQuotation);

      await service.updateStatus(
        'q-1',
        'SENT',
        'Sending to client',
        'user-1',
        Role.SALES_REP,
      );

      expect(mockPrismaService.statusHistory.create).toHaveBeenCalled();
      expect(mockPrismaService.quotation.update).toHaveBeenCalled();
    });

    it('updates quotation status correctly', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue(draftQuotation);
      mockPrismaService.statusHistory.create.mockResolvedValue({});
      mockPrismaService.quotation.update.mockResolvedValue(sentQuotation);

      const result = await service.updateStatus(
        'q-1',
        'SENT',
        undefined,
        'user-1',
        Role.SALES_REP,
      );

      expect(result).toMatchObject({ status: QuotationStatus.SENT });
    });

    it('throws NotFoundException when quotation not found', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue(null);

      await expect(
        service.updateStatus(
          'q-999',
          'SENT',
          undefined,
          'user-1',
          Role.SALES_REP,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('q-999'),
        QuotationsService.name,
      );
    });

    it('throws ForbiddenException when SALES_REP tries to APPROVE', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue(sentQuotation);

      await expect(
        service.updateStatus(
          'q-1',
          QuotationStatus.APPROVED,
          undefined,
          'user-1',
          Role.SALES_REP,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrismaService.quotation.update).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when SALES_REP tries to REJECT', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue(sentQuotation);

      await expect(
        service.updateStatus(
          'q-1',
          QuotationStatus.REJECTED,
          undefined,
          'user-1',
          Role.SALES_REP,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrismaService.quotation.update).not.toHaveBeenCalled();
    });

    it('allows SALES_MANAGER to APPROVE', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue(sentQuotation);
      mockPrismaService.statusHistory.create.mockResolvedValue({});
      mockPrismaService.quotation.update.mockResolvedValue(approvedQuotation);

      const result = await service.updateStatus(
        'q-1',
        QuotationStatus.APPROVED,
        undefined,
        'manager-1',
        Role.SALES_MANAGER,
      );
      expect(result).toMatchObject({ status: QuotationStatus.APPROVED });
    });

    it('throws BadRequestException on illegal status transition', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue(
        approvedQuotation,
      );

      await expect(
        service.updateStatus(
          'q-1',
          QuotationStatus.SENT,
          undefined,
          'user-1',
          Role.SALES_REP,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.quotation.update).not.toHaveBeenCalled();
    });

    it('does not log error for domain exceptions (NotFoundException)', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue(null);

      await expect(
        service.updateStatus(
          'q-999',
          QuotationStatus.SENT,
          undefined,
          'user-1',
          Role.SALES_REP,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('throws when prisma findFirst fails', async () => {
      mockPrismaService.quotation.findFirst.mockRejectedValue(
        new Error('DB error'),
      );

      await expect(
        service.updateStatus(
          'q-1',
          'SENT',
          undefined,
          'user-1',
          Role.SALES_REP,
        ),
      ).rejects.toThrow('DB error');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('logs String(error) when a non-Error is thrown', async () => {
      mockPrismaService.quotation.findFirst.mockRejectedValue(
        'plain string error',
      );
      await expect(
        service.updateStatus(
          'q-1',
          'SENT',
          undefined,
          'user-1',
          Role.SALES_REP,
        ),
      ).rejects.toBe('plain string error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(String),
        'plain string error',
        QuotationsService.name,
      );
    });

    it('emails all managers when status transitions to SENT', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue(draftQuotation);
      mockPrismaService.statusHistory.create.mockResolvedValue({});
      mockPrismaService.quotation.update.mockResolvedValue({
        ...richQuotation,
        status: QuotationStatus.SENT,
      });
      mockPrismaService.user.findMany.mockResolvedValue([
        { email: 'manager1@quoteiq.com' },
        { email: 'manager2@quoteiq.com' },
      ]);

      await service.updateStatus(
        'q-1',
        QuotationStatus.SENT,
        undefined,
        'user-1',
        Role.SALES_REP,
      );

      expect(mockMailService.sendMail).toHaveBeenCalledTimes(2);
      expect(mockMailService.sendMail).toHaveBeenCalledWith(
        'manager1@quoteiq.com',
        expect.stringContaining('QT-2026-0001'),
        expect.stringContaining('Anna'),
      );
    });

    it('emails the rep when status transitions to APPROVED', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue(sentQuotation);
      mockPrismaService.statusHistory.create.mockResolvedValue({});
      mockPrismaService.quotation.update.mockResolvedValue({
        ...richQuotation,
        status: QuotationStatus.APPROVED,
      });

      await service.updateStatus(
        'q-1',
        QuotationStatus.APPROVED,
        undefined,
        'manager-1',
        Role.SALES_MANAGER,
      );

      expect(mockMailService.sendMail).toHaveBeenCalledTimes(1);
      expect(mockMailService.sendMail).toHaveBeenCalledWith(
        'anna@quoteiq.com',
        expect.stringContaining('QT-2026-0001'),
        expect.stringContaining('approved'),
      );
    });

    it('emails the rep with note when status transitions to REJECTED', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue(sentQuotation);
      mockPrismaService.statusHistory.create.mockResolvedValue({});
      mockPrismaService.quotation.update.mockResolvedValue({
        ...richQuotation,
        status: QuotationStatus.REJECTED,
      });

      await service.updateStatus(
        'q-1',
        QuotationStatus.REJECTED,
        'Price too high',
        'manager-1',
        Role.SALES_MANAGER,
      );

      expect(mockMailService.sendMail).toHaveBeenCalledTimes(1);
      expect(mockMailService.sendMail).toHaveBeenCalledWith(
        'anna@quoteiq.com',
        expect.stringContaining('QT-2026-0001'),
        expect.stringContaining('Price too high'),
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
      mockPrismaService.quotation.create.mockRejectedValue(
        'plain string error',
      );
      await expect(
        service.create(
          {
            title: 'T',
            clientName: 'Hans Bauer',
            taxRate: 0,
            items: [
              { description: 'X', quantity: 1, unitPrice: 10, sortOrder: 0 },
            ],
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
      await expect(service.delete('q-1', 'user-1')).rejects.toBe(
        'plain string error',
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(String),
        'plain string error',
        QuotationsService.name,
      );
    });
  });

  describe('findStatusHistory', () => {
    const mockHistory = [
      {
        id: 'sh-1',
        quotationId: 'q-1',
        fromStatus: QuotationStatus.DRAFT,
        toStatus: QuotationStatus.SENT,
        note: null,
        changedAt: new Date('2026-01-01'),
        changedById: 'user-1',
        changedBy: { id: 'user-1', name: 'Anna Schmidt' },
      },
    ];

    it('returns history for a manager without ownership check', async () => {
      mockPrismaService.statusHistory.findMany.mockResolvedValue(mockHistory);
      const result = await service.findStatusHistory(
        'q-1',
        'user-1',
        Role.SALES_MANAGER,
      );
      expect(mockPrismaService.quotation.findFirst).not.toHaveBeenCalled();
      expect(mockPrismaService.statusHistory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { quotationId: 'q-1' } }),
      );
      expect(result).toEqual(mockHistory);
    });

    it('returns history for a SALES_REP who owns the quotation', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue({
        createdById: 'user-1',
      });
      mockPrismaService.statusHistory.findMany.mockResolvedValue(mockHistory);
      const result = await service.findStatusHistory(
        'q-1',
        'user-1',
        Role.SALES_REP,
      );
      expect(result).toEqual(mockHistory);
    });

    it('throws NotFoundException when quotation not found for SALES_REP', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue(null);
      await expect(
        service.findStatusHistory('q-999', 'user-1', Role.SALES_REP),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when SALES_REP accesses another rep history', async () => {
      mockPrismaService.quotation.findFirst.mockResolvedValue({
        createdById: 'user-999',
      });
      await expect(
        service.findStatusHistory('q-1', 'user-1', Role.SALES_REP),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update', () => {
    const draftOwned = {
      id: 'q-1',
      status: QuotationStatus.DRAFT,
      createdById: 'user-1',
      taxRate: 0,
    };
    const currentVersion = { version: 1 };
    const updatedQuotation = {
      id: 'q-1',
      title: 'Updated Title',
      clientName: 'Updated Corp',
      status: QuotationStatus.DRAFT,
      version: 2,
      items: [],
      createdBy: { id: 'user-1', name: 'Anna' },
    };

    beforeEach(() => {
      // findFirst call order: validateUpdatePermissions → version check
      mockPrismaService.quotation.findFirst
        .mockResolvedValueOnce(draftOwned)
        .mockResolvedValueOnce(currentVersion);
      mockPrismaService.quotation.update.mockResolvedValue(updatedQuotation);
    });

    it('calls update with version increment and correct fields', async () => {
      await service.update(
        'q-1',
        { title: 'Updated Title', clientName: 'Updated Corp', version: 1 },
        'user-1',
      );
      expect(mockPrismaService.quotation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'q-1' },
          data: expect.objectContaining({
            title: 'Updated Title',
            clientName: 'Updated Corp',
            version: { increment: 1 },
          }),
        }),
      );
    });

    it('returns the updated quotation', async () => {
      const result = await service.update(
        'q-1',
        { title: 'Updated Title', clientName: 'Updated Corp', version: 1 },
        'user-1',
      );
      expect(result).toEqual(updatedQuotation);
    });

    it('recalculates totals when items are replaced', async () => {
      // findFirst order: validateUpdatePermissions → taxRate lookup → version check
      mockPrismaService.quotation.findFirst
        .mockReset()
        .mockResolvedValueOnce(draftOwned)
        .mockResolvedValueOnce({ taxRate: 0 })
        .mockResolvedValueOnce(currentVersion);
      await service.update(
        'q-1',
        {
          items: [
            {
              description: 'New Item',
              quantity: 2,
              unitPrice: 500,
              sortOrder: 0,
            },
          ],
          version: 1,
        },
        'user-1',
      );
      expect(mockPrismaService.quotation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ subtotal: 1000, total: 1000 }),
        }),
      );
    });

    it('recalculates totals from existing items when only taxRate changes', async () => {
      mockPrismaService.quotation.findFirst
        .mockReset()
        .mockResolvedValueOnce(draftOwned)
        .mockResolvedValueOnce(currentVersion);
      mockPrismaService.quotationItem.findMany.mockResolvedValue([
        { description: 'Item', quantity: 1, unitPrice: 1000, lineTotal: 1000 },
      ]);
      await service.update('q-1', { taxRate: 19, version: 1 }, 'user-1');
      expect(mockPrismaService.quotationItem.findMany).toHaveBeenCalled();
      expect(mockPrismaService.quotation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ taxRate: 19, taxAmount: 190 }),
        }),
      );
    });

    it('throws ConflictException when input version does not match DB version', async () => {
      mockPrismaService.quotation.findFirst
        .mockReset()
        .mockResolvedValueOnce(draftOwned)
        .mockResolvedValueOnce({ version: 5 }); // DB has version 5, input sends 1
      await expect(
        service.update('q-1', { title: 'Stale Edit', version: 1 }, 'user-1'),
      ).rejects.toThrow(ConflictException);
      expect(mockPrismaService.quotation.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when quotation not found', async () => {
      mockPrismaService.quotation.findFirst
        .mockReset()
        .mockResolvedValueOnce(null);
      await expect(
        service.update('q-999', { version: 1 }, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when quotation is not DRAFT', async () => {
      mockPrismaService.quotation.findFirst
        .mockReset()
        .mockResolvedValueOnce({ ...draftOwned, status: QuotationStatus.SENT });
      await expect(
        service.update('q-1', { version: 1 }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException when user does not own the quotation', async () => {
      mockPrismaService.quotation.findFirst
        .mockReset()
        .mockResolvedValueOnce({ ...draftOwned, createdById: 'user-999' });
      await expect(
        service.update('q-1', { version: 1 }, 'user-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when title is empty after strip', async () => {
      await expect(
        service.update('q-1', { title: '<b></b>', version: 1 }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when taxRate is out of range', async () => {
      mockPrismaService.quotation.findFirst
        .mockReset()
        .mockResolvedValueOnce(draftOwned);
      await expect(
        service.update('q-1', { taxRate: 101, version: 1 }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('deletes stale AIInsight cache entries after successful update', async () => {
      await service.update(
        'q-1',
        { title: 'Updated Title', version: 1 },
        'user-1',
      );
      expect(mockPrismaService.aIInsight.deleteMany).toHaveBeenCalledWith({
        where: { quotationId: 'q-1' },
      });
    });

    it('writes a DRAFT→DRAFT history entry with changed fields note on update', async () => {
      await service.update(
        'q-1',
        { title: 'Updated Title', clientName: 'Updated Corp', version: 1 },
        'user-1',
      );
      expect(mockPrismaService.statusHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          quotationId: 'q-1',
          fromStatus: 'DRAFT',
          toStatus: 'DRAFT',
          changedById: 'user-1',
          note: expect.stringContaining('title'),
        }),
      });
    });

    it('throws BadRequestException when clientName exceeds 200 characters on update', async () => {
      mockPrismaService.quotation.findFirst
        .mockReset()
        .mockResolvedValueOnce(draftOwned);
      await expect(
        service.update(
          'q-1',
          { clientName: 'A'.repeat(201), version: 1 },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('sets notes to null when update input is an empty string after strip', async () => {
      await service.update('q-1', { notes: '<b>  </b>', version: 1 }, 'user-1');
      expect(mockPrismaService.quotation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ notes: null }),
        }),
      );
    });

    it('throws BadRequestException when item description is empty after strip (update)', async () => {
      mockPrismaService.quotation.findFirst
        .mockReset()
        .mockResolvedValueOnce(draftOwned)
        .mockResolvedValueOnce({ taxRate: 0 })
        .mockResolvedValueOnce(currentVersion);
      await expect(
        service.update(
          'q-1',
          {
            items: [
              {
                description: '<b></b>',
                quantity: 1,
                unitPrice: 10,
                sortOrder: 0,
              },
            ],
            version: 1,
          },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when item quantity is zero (update)', async () => {
      mockPrismaService.quotation.findFirst
        .mockReset()
        .mockResolvedValueOnce(draftOwned)
        .mockResolvedValueOnce({ taxRate: 0 })
        .mockResolvedValueOnce(currentVersion);
      await expect(
        service.update(
          'q-1',
          {
            items: [
              { description: 'Item', quantity: 0, unitPrice: 10, sortOrder: 0 },
            ],
            version: 1,
          },
          'user-1',
        ),
      ).rejects.toThrow('Item quantity must be greater than 0');
    });

    it('throws BadRequestException when item unitPrice is zero (update)', async () => {
      mockPrismaService.quotation.findFirst
        .mockReset()
        .mockResolvedValueOnce(draftOwned)
        .mockResolvedValueOnce({ taxRate: 0 })
        .mockResolvedValueOnce(currentVersion);
      await expect(
        service.update(
          'q-1',
          {
            items: [
              { description: 'Item', quantity: 1, unitPrice: 0, sortOrder: 0 },
            ],
            version: 1,
          },
          'user-1',
        ),
      ).rejects.toThrow('Item unit price must be greater than 0');
    });
  });
});

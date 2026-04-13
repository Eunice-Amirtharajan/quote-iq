import { Test, TestingModule } from '@nestjs/testing';
import { ClientsService } from './clients.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AppLogger } from '../../common/logger/logger.service';
import { Role } from '@prisma/client';
import type { User } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';

const mockPrismaService = {
  client: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

const mockUser = (role: Role): User => ({
  id: 'user-1',
  email: 'test@quoteiq.com',
  name: 'Test User',
  password: 'hash',
  role,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('ClientsService', () => {
  let service: ClientsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AppLogger, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<ClientsService>(ClientsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findAll', () => {
    it('fetches all clients for SALES_MANAGER', async () => {
      mockPrismaService.client.findMany.mockResolvedValue([]);
      await service.findAll(mockUser(Role.SALES_MANAGER));
      expect(mockPrismaService.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it('fetches all clients for ADMIN', async () => {
      mockPrismaService.client.findMany.mockResolvedValue([]);
      await service.findAll(mockUser(Role.ADMIN));
      expect(mockPrismaService.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it('fetches only own clients for SALES_REP', async () => {
      mockPrismaService.client.findMany.mockResolvedValue([]);
      await service.findAll(mockUser(Role.SALES_REP));
      expect(mockPrismaService.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { createdById: 'user-1' } }),
      );
    });
    it('throws and logs error when findAll prisma fails', async () => {
      mockPrismaService.client.findMany.mockRejectedValue(
        new Error('DB error'),
      );
      await expect(service.findAll(mockUser(Role.SALES_REP))).rejects.toThrow(
        'DB error',
      );
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('returns client when found', async () => {
      const mockClient = { id: 'c-1', name: 'Hans Bauer' };
      mockPrismaService.client.findUnique.mockResolvedValue(mockClient);
      const result = await service.findOne('c-1');
      expect(result).toEqual(mockClient);
    });

    it('returns null and logs warn when not found', async () => {
      mockPrismaService.client.findUnique.mockResolvedValue(null);
      const result = await service.findOne('c-999');
      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('c-999'),
        ClientsService.name,
      );
    });
    it('throws and logs error when findOne prisma fails', async () => {
      mockPrismaService.client.findUnique.mockRejectedValue(
        new Error('DB error'),
      );
      await expect(service.findOne('c-1')).rejects.toThrow('DB error');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('creates client with correct createdById', async () => {
      const input = {
        name: 'Hans Bauer',
        company: 'Bauer GmbH',
        email: 'hans@bauer.de',
      };
      const mockClient = { id: 'c-1', ...input, createdById: 'user-1' };
      mockPrismaService.client.create.mockResolvedValue(mockClient);

      const result = await service.create(input, mockUser(Role.SALES_REP));

      expect(result).toEqual(mockClient);
      expect(mockPrismaService.client.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ createdById: 'user-1' }),
        }),
      );
    });
    it('throws and logs error when create prisma fails', async () => {
      mockPrismaService.client.create.mockRejectedValue(new Error('DB error'));
      await expect(
        service.create(
          { name: 'Test', company: 'Test', email: 'test@test.de' },
          mockUser(Role.SALES_REP),
        ),
      ).rejects.toThrow('DB error');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('updates client with correct id', async () => {
      const input = {
        name: 'Updated Name',
        company: 'Updated GmbH',
        email: 'updated@test.de',
      };
      const mockClient = { id: 'c-1', ...input };

      // Mock findOne (used inside update to check existence)
      mockPrismaService.client.findUnique.mockResolvedValue(mockClient);
      mockPrismaService.client.update.mockResolvedValue(mockClient);

      const result = await service.update('c-1', input);

      expect(result).toEqual(mockClient);
      expect(mockPrismaService.client.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'c-1' } }),
      );
    });

    it('throws NotFoundException when client does not exist', async () => {
      mockPrismaService.client.findUnique.mockResolvedValue(null);

      await expect(
        service.update('c-999', {
          name: 'Test',
          company: 'Test',
          email: 'test@test.de',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws when prisma update throws', async () => {
      const existingClient = {
        id: 'c-1',
        name: 'Test',
        company: 'Test',
        email: 'test@test.de',
      };
      mockPrismaService.client.findUnique.mockResolvedValue(existingClient);
      mockPrismaService.client.update.mockRejectedValue(new Error('DB error'));

      await expect(
        service.update('c-1', {
          name: 'Test',
          company: 'Test',
          email: 'test@test.de',
        }),
      ).rejects.toThrow('DB error');
    });
  });
});

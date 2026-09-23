import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { PrismaService } from '../../prisma/prisma.service';

const CLIENT_ID = '11111111-1111-1111-1111-111111111111';

const mockClient = {
  id: CLIENT_ID,
  name: 'Acme Corp',
  email: 'acme@example.com',
  createdAt: new Date('2026-01-01'),
};

const mockPrismaService = {
  client: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    upsert: jest.fn(),
    count: jest.fn(),
    delete: jest.fn(),
  },
  quotation: {
    count: jest.fn(),
  },
};

describe('ClientsService', () => {
  let service: ClientsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<ClientsService>(ClientsService);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('returns clients ordered by name with default skip/take', async () => {
      mockPrismaService.client.findMany.mockResolvedValue([mockClient]);

      const result = await service.findAll();

      expect(result).toEqual([mockClient]);
      expect(mockPrismaService.client.findMany).toHaveBeenCalledWith({
        where: undefined,
        orderBy: { name: 'asc' },
        skip: 0,
        take: 50,
      });
    });

    it('applies search filter case-insensitively', async () => {
      mockPrismaService.client.findMany.mockResolvedValue([mockClient]);

      await service.findAll('acme');

      expect(mockPrismaService.client.findMany).toHaveBeenCalledWith({
        where: { name: { contains: 'acme', mode: 'insensitive' } },
        orderBy: { name: 'asc' },
        skip: 0,
        take: 50,
      });
    });

    it('applies skip and take for pagination', async () => {
      mockPrismaService.client.findMany.mockResolvedValue([]);

      await service.findAll(undefined, 50, 25);

      expect(mockPrismaService.client.findMany).toHaveBeenCalledWith({
        where: undefined,
        orderBy: { name: 'asc' },
        skip: 50,
        take: 25,
      });
    });
  });

  describe('countAll', () => {
    it('returns total count without search', async () => {
      mockPrismaService.client.count.mockResolvedValue(42);

      const result = await service.countAll();

      expect(result).toBe(42);
      expect(mockPrismaService.client.count).toHaveBeenCalledWith({
        where: undefined,
      });
    });

    it('returns filtered count when search is provided', async () => {
      mockPrismaService.client.count.mockResolvedValue(3);

      const result = await service.countAll('bauer');

      expect(result).toBe(3);
      expect(mockPrismaService.client.count).toHaveBeenCalledWith({
        where: { name: { contains: 'bauer', mode: 'insensitive' } },
      });
    });
  });

  describe('findOne', () => {
    it('returns the client when found', async () => {
      mockPrismaService.client.findFirst.mockResolvedValue(mockClient);

      const result = await service.findOne(CLIENT_ID);

      expect(result).toEqual(mockClient);
      expect(mockPrismaService.client.findFirst).toHaveBeenCalledWith({
        where: { id: CLIENT_ID },
      });
    });

    it('throws NotFoundException when client does not exist', async () => {
      mockPrismaService.client.findFirst.mockResolvedValue(null);

      await expect(service.findOne(CLIENT_ID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('deletes a client with no quotations and returns true', async () => {
      mockPrismaService.client.findFirst.mockResolvedValue(mockClient);
      mockPrismaService.quotation.count.mockResolvedValue(0);
      mockPrismaService.client.delete.mockResolvedValue(mockClient);

      const result = await service.delete(CLIENT_ID);

      expect(result).toBe(true);
      expect(mockPrismaService.client.delete).toHaveBeenCalledWith({ where: { id: CLIENT_ID } });
    });

    it('throws BadRequestException when client has linked quotations', async () => {
      mockPrismaService.client.findFirst.mockResolvedValue(mockClient);
      mockPrismaService.quotation.count.mockResolvedValue(5);

      await expect(service.delete(CLIENT_ID)).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.client.delete).not.toHaveBeenCalled();
    });

    it('includes the quotation count in the error message', async () => {
      mockPrismaService.client.findFirst.mockResolvedValue(mockClient);
      mockPrismaService.quotation.count.mockResolvedValue(3);

      await expect(service.delete(CLIENT_ID)).rejects.toThrow('3 quotations are');
    });

    it('throws NotFoundException when client does not exist', async () => {
      mockPrismaService.client.findFirst.mockResolvedValue(null);

      await expect(service.delete(CLIENT_ID)).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.client.delete).not.toHaveBeenCalled();
    });
  });

  describe('findOrCreate', () => {
    it('creates a new client when none exists', async () => {
      mockPrismaService.client.upsert.mockResolvedValue(mockClient);

      const result = await service.findOrCreate('Acme Corp', 'acme@example.com');

      expect(result).toEqual(mockClient);
      expect(mockPrismaService.client.upsert).toHaveBeenCalledWith({
        where: { name: 'Acme Corp' },
        update: { email: 'acme@example.com' },
        create: { name: 'Acme Corp', email: 'acme@example.com' },
      });
    });

    it('trims the name before upserting', async () => {
      mockPrismaService.client.upsert.mockResolvedValue(mockClient);

      await service.findOrCreate('  Acme Corp  ');

      expect(mockPrismaService.client.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { name: 'Acme Corp' } }),
      );
    });

    it('omits email update when email is undefined', async () => {
      mockPrismaService.client.upsert.mockResolvedValue(mockClient);

      await service.findOrCreate('Acme Corp');

      expect(mockPrismaService.client.upsert).toHaveBeenCalledWith({
        where: { name: 'Acme Corp' },
        update: {},
        create: { name: 'Acme Corp', email: null },
      });
    });

    it('omits email update when email is null', async () => {
      mockPrismaService.client.upsert.mockResolvedValue(mockClient);

      await service.findOrCreate('Acme Corp', null);

      expect(mockPrismaService.client.upsert).toHaveBeenCalledWith({
        where: { name: 'Acme Corp' },
        update: {},
        create: { name: 'Acme Corp', email: null },
      });
    });
  });
});

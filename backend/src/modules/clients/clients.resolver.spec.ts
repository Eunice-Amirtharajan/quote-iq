import { Test, TestingModule } from '@nestjs/testing';
import { ClientsResolver } from './clients.resolver';
import { ClientsService } from './clients.service';
import { NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { User } from '@prisma/client';
import { UserType } from '../users/user.entity';
import { ClientInput } from './dto/client.input';

const mockClientsService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

const mockUser: User = {
  id: 'user-1',
  email: 'anna@quoteiq.com',
  name: 'Anna Schmidt',
  password: 'hash',
  role: Role.SALES_REP,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockClient = {
  id: 'c-1',
  name: 'Hans Bauer',
  company: 'Bauer GmbH',
  email: 'hans@bauer.de',
  phone: null,
  city: 'Berlin',
  country: 'Germany',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('ClientsResolver', () => {
  let resolver: ClientsResolver;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientsResolver,
        { provide: ClientsService, useValue: mockClientsService },
      ],
    }).compile();

    resolver = module.get<ClientsResolver>(ClientsResolver);
  });

  afterEach(() => jest.clearAllMocks());

  describe('clients', () => {
    it('returns all clients for current user', async () => {
      mockClientsService.findAll.mockResolvedValue([mockClient]);
      const result = await resolver.clients(mockUser as UserType);
      expect(mockClientsService.findAll).toHaveBeenCalledWith(mockUser);
      expect(result).toEqual([mockClient]);
    });
  });

  describe('client', () => {
    it('returns client by id', async () => {
      mockClientsService.findOne.mockResolvedValue(mockClient);
      const result = await resolver.client('c-1');
      expect(result).toEqual(mockClient);
    });

    it('returns null when client not found', async () => {
      mockClientsService.findOne.mockResolvedValue(null);
      const result = await resolver.client('c-999');
      expect(result).toBeNull();
    });
  });

  describe('createClient', () => {
    it('creates and returns new client', async () => {
      const input = {
        name: 'New Client',
        company: 'New GmbH',
        email: 'new@test.de',
      };
      mockClientsService.create.mockResolvedValue(mockClient);

      const result = await resolver.createClient(
        input as ClientInput,
        mockUser as UserType,
      );

      expect(mockClientsService.create).toHaveBeenCalledWith(input, mockUser);
      expect(result).toEqual(mockClient);
    });
  });

  describe('updateClient', () => {
    it('updates and returns client when found', async () => {
      const input = {
        name: 'Updated',
        company: 'Updated GmbH',
        email: 'updated@test.de',
      };
      mockClientsService.update.mockResolvedValue({ ...mockClient, ...input });

      const result = await resolver.updateClient('c-1', input as ClientInput);

      expect(mockClientsService.update).toHaveBeenCalledWith('c-1', input);
      expect(result).toMatchObject(input);
    });

    it('propagates NotFoundException from service when client not found', async () => {
      mockClientsService.update.mockRejectedValue(
        new NotFoundException('Client c-999 not found'),
      );

      await expect(
        resolver.updateClient('c-999', {
          name: 'Test',
          company: 'Test',
          email: 'test@test.de',
        } as ClientInput),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteClient', () => {
    it('deletes and returns true', async () => {
      mockClientsService.delete.mockResolvedValue(true);
      const result = await resolver.deleteClient('c-1');
      expect(mockClientsService.delete).toHaveBeenCalledWith('c-1');
      expect(result).toBe(true);
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { ClientsResolver } from './clients.resolver';
import { ClientsService } from './clients.service';
import { Role } from '@prisma/client';
import type { User } from '@prisma/client';
import { UserType } from '../users/user.entity';
import { ClientInput } from './dto/client.input';

const mockClientsService = {
  findAll: jest.fn(),
  findOwner: jest.fn(),
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
  createdById: 'user-1',
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
      expect(mockClientsService.findAll).toHaveBeenCalledWith(
        mockUser,
        undefined,
        undefined,
      );
      expect(result).toEqual([mockClient]);
    });
  });

  describe('client', () => {
    it('returns client by id for SALES_REP who owns it', async () => {
      mockClientsService.findOwner.mockResolvedValue({ createdById: 'user-1' });
      mockClientsService.findOne.mockResolvedValue(mockClient);
      const result = await resolver.client('c-1', mockUser as UserType);
      expect(mockClientsService.findOwner).toHaveBeenCalledWith('c-1');
      expect(result).toEqual(mockClient);
    });

    it('returns null when client not found', async () => {
      mockClientsService.findOwner.mockResolvedValue(null);
      const result = await resolver.client('c-999', mockUser as UserType);
      expect(result).toBeNull();
      expect(mockClientsService.findOne).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when SALES_REP accesses another rep client', async () => {
      mockClientsService.findOwner.mockResolvedValue({
        createdById: 'user-999',
      });
      await expect(
        resolver.client('c-1', mockUser as UserType),
      ).rejects.toThrow('Forbidden');
      expect(mockClientsService.findOne).not.toHaveBeenCalled();
    });

    it('fetches full record directly for SALES_MANAGER without owner check', async () => {
      const manager = { ...mockUser, role: Role.SALES_MANAGER };
      mockClientsService.findOne.mockResolvedValue(mockClient);
      const result = await resolver.client('c-1', manager as UserType);
      expect(mockClientsService.findOwner).not.toHaveBeenCalled();
      expect(result).toEqual(mockClient);
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
      mockClientsService.findOwner.mockResolvedValue({ createdById: 'user-1' });
      mockClientsService.update.mockResolvedValue({ ...mockClient, ...input });

      const result = await resolver.updateClient(
        'c-1',
        input as ClientInput,
        mockUser as UserType,
      );

      expect(mockClientsService.update).toHaveBeenCalledWith('c-1', input);
      expect(result).toMatchObject(input);
    });

    it('throws NotFoundException when client not found', async () => {
      mockClientsService.findOwner.mockResolvedValue(null);

      await expect(
        resolver.updateClient(
          'c-999',
          {
            name: 'Test',
            company: 'Test',
            email: 'test@test.de',
          } as ClientInput,
          mockUser as UserType,
        ),
      ).rejects.toThrow('Client c-999 not found');
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

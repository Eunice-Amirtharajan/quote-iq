import { Test, TestingModule } from '@nestjs/testing';
import { ClientsResolver } from './clients.resolver';
import { ClientsService } from './clients.service';

const mockClient = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Acme Corp',
  email: 'acme@example.com',
  createdAt: new Date('2026-01-01'),
};

const mockClientsService = {
  findAll: jest.fn(),
  countAll: jest.fn(),
  findOne: jest.fn(),
  findOrCreate: jest.fn(),
  delete: jest.fn(),
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
    jest.clearAllMocks();
  });

  describe('clients (flat list for ClientSelector)', () => {
    it('returns up to 50 clients without search', async () => {
      mockClientsService.findAll.mockResolvedValue([mockClient]);

      const result = await resolver.clients();

      expect(result).toEqual([mockClient]);
      expect(mockClientsService.findAll).toHaveBeenCalledWith(undefined, 0, 50);
    });

    it('passes search term through to service', async () => {
      mockClientsService.findAll.mockResolvedValue([mockClient]);

      const result = await resolver.clients('acme');

      expect(result).toEqual([mockClient]);
      expect(mockClientsService.findAll).toHaveBeenCalledWith('acme', 0, 50);
    });
  });

  describe('clientsPage (paginated list for ClientsPage)', () => {
    it('returns items and total with defaults', async () => {
      mockClientsService.findAll.mockResolvedValue([mockClient]);
      mockClientsService.countAll.mockResolvedValue(1);

      const result = await resolver.clientsPage();

      expect(result).toEqual({ items: [mockClient], total: 1 });
      expect(mockClientsService.findAll).toHaveBeenCalledWith(undefined, 0, 50);
      expect(mockClientsService.countAll).toHaveBeenCalledWith(undefined);
    });

    it('passes search, skip and take through to service', async () => {
      mockClientsService.findAll.mockResolvedValue([mockClient]);
      mockClientsService.countAll.mockResolvedValue(75);

      const result = await resolver.clientsPage('bauer', 50, 25);

      expect(result).toEqual({ items: [mockClient], total: 75 });
      expect(mockClientsService.findAll).toHaveBeenCalledWith('bauer', 50, 25);
      expect(mockClientsService.countAll).toHaveBeenCalledWith('bauer');
    });

    it('runs findAll and countAll in parallel', async () => {
      const order: string[] = [];
      mockClientsService.findAll.mockImplementation(async () => {
        order.push('findAll');
        return [mockClient];
      });
      mockClientsService.countAll.mockImplementation(async () => {
        order.push('countAll');
        return 1;
      });

      await resolver.clientsPage();

      expect(order).toHaveLength(2);
    });
  });

  describe('client', () => {
    it('returns a single client by id', async () => {
      mockClientsService.findOne.mockResolvedValue(mockClient);

      const result = await resolver.client(mockClient.id);

      expect(result).toEqual(mockClient);
      expect(mockClientsService.findOne).toHaveBeenCalledWith(mockClient.id);
    });
  });

  describe('deleteClient', () => {
    it('delegates to clientsService.delete and returns true', async () => {
      mockClientsService.delete.mockResolvedValue(true);

      const result = await resolver.deleteClient(mockClient.id);

      expect(result).toBe(true);
      expect(mockClientsService.delete).toHaveBeenCalledWith(mockClient.id);
    });

    it('propagates exceptions from the service', async () => {
      mockClientsService.delete.mockRejectedValue(new Error('3 quotations are linked'));

      await expect(resolver.deleteClient(mockClient.id)).rejects.toThrow('3 quotations are linked');
    });
  });

  describe('createClient', () => {
    it('calls findOrCreate with name and email', async () => {
      mockClientsService.findOrCreate.mockResolvedValue(mockClient);

      const result = await resolver.createClient('Acme Corp', 'acme@example.com');

      expect(result).toEqual(mockClient);
      expect(mockClientsService.findOrCreate).toHaveBeenCalledWith(
        'Acme Corp',
        'acme@example.com',
      );
    });

    it('calls findOrCreate with name only when email is omitted', async () => {
      mockClientsService.findOrCreate.mockResolvedValue(mockClient);

      await resolver.createClient('Acme Corp');

      expect(mockClientsService.findOrCreate).toHaveBeenCalledWith(
        'Acme Corp',
        undefined,
      );
    });
  });
});

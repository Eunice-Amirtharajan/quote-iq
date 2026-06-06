import { Test, TestingModule } from '@nestjs/testing';
import { AuthResolver } from './auth.resolver';
import { AuthService } from './auth.service';
import { Response } from 'express';
import type { Role, User } from '@prisma/client';
import { UserType } from '../users/user.entity';

const mockAuthService = {
  login: jest.fn(),
  logout: jest.fn(),
  salesReps: jest.fn(),
};

const mockUser: User = {
  id: 'user-1',
  email: 'marcus@quoteiq.com',
  name: 'Marcus Klein',
  password: 'hash',
  role: 'SALES_MANAGER' as Role,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockResponse = {
  cookie: jest.fn(),
  clearCookie: jest.fn(),
} as unknown as Response;

describe('AuthResolver', () => {
  let resolver: AuthResolver;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthResolver,
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();

    resolver = module.get<AuthResolver>(AuthResolver);
  });

  afterEach(() => jest.clearAllMocks());

  describe('login', () => {
    it('calls authService.login with correct params and returns user', async () => {
      mockAuthService.login.mockResolvedValue(mockUser);

      const result = await resolver.login('marcus@quoteiq.com', 'password123', {
        res: mockResponse,
      });

      expect(mockAuthService.login).toHaveBeenCalledWith(
        'marcus@quoteiq.com',
        'password123',
        mockResponse,
      );
      expect(result).toEqual(mockUser);
    });

    it('propagates error when authService.login throws', async () => {
      mockAuthService.login.mockRejectedValue(new Error('Invalid credentials'));

      await expect(
        resolver.login('bad@test.com', 'wrong', { res: mockResponse }),
      ).rejects.toThrow('Invalid credentials');
    });
  });

  describe('logout', () => {
    it('calls authService.logout and returns true', () => {
      mockAuthService.logout.mockReturnValue(true);

      const result = resolver.logout({ res: mockResponse });

      expect(mockAuthService.logout).toHaveBeenCalledWith(mockResponse);
      expect(result).toBe(true);
    });
  });

  describe('me', () => {
    it('returns the current user', () => {
      const result = resolver.me(mockUser as UserType);
      expect(result).toEqual(mockUser);
    });
  });

  describe('salesReps', () => {
    it('delegates to authService.salesReps and returns the result', async () => {
      const mockReps = [
        { id: 'u-1', name: 'Anna Schmidt', role: 'SALES_REP' },
        { id: 'u-2', name: 'Ben Müller', role: 'SALES_REP' },
      ];
      mockAuthService.salesReps.mockResolvedValue(mockReps);

      const result = await resolver.salesReps();

      expect(mockAuthService.salesReps).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockReps);
    });
  });
});

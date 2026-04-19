jest.mock('bcrypt', () => ({
  compare: jest.fn(),
}));
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { AppLogger } from '../../common/logger/logger.service';
import * as bcrypt from 'bcrypt';
import { Response } from 'express';

const mockPrismaService = {
  user: {
    findUnique: jest.fn(),
  },
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue('mock-jwt-token'),
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

const mockResponse = {
  cookie: jest.fn(),
  clearCookie: jest.fn(),
} as unknown as Response;

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: AppLogger, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('login', () => {
    const mockUser = {
      id: 'user-1',
      email: 'marcus@quoteiq.com',
      password: 'hashed-password',
      name: 'Marcus Klein',
      role: 'SALES_MANAGER',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('returns user and sets cookie on valid credentials', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login(
        'marcus@quoteiq.com',
        'password123',
        mockResponse,
      );

      expect(result).toEqual(mockUser);
      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'access_token',
        'mock-jwt-token',
        expect.objectContaining({ httpOnly: true }),
      );
    });
    it('throws UnauthorizedException when password is wrong', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login('marcus@quoteiq.com', 'wrongpassword', mockResponse),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('signs JWT with correct payload', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.login('marcus@quoteiq.com', 'password123', mockResponse);

      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
      });
    });

    it('does not set cookie when login fails', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login('wrong@email.com', 'password123', mockResponse),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockResponse.cookie).not.toHaveBeenCalled();
    });
    it('throws when JWT signing fails', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockJwtService.sign.mockImplementation(() => {
        throw new Error('JWT error');
      });

      await expect(
        service.login('marcus@quoteiq.com', 'password123', mockResponse),
      ).rejects.toThrow('JWT error');
    });
  });

  describe('logout', () => {
    it('clears the access_token cookie', () => {
      const result = service.logout(mockResponse);
      expect(mockResponse.clearCookie).toHaveBeenCalledWith('access_token', {
        httpOnly: true,
        sameSite: 'none',
        secure: true,
      });
      expect(result).toBe(true);
    });
  });
  it('throws and logs error when clearCookie fails', () => {
    const errorResponse = {
      clearCookie: jest.fn().mockImplementation(() => {
        throw new Error('Cookie error');
      }),
    } as unknown as Response;

    expect(() => service.logout(errorResponse)).toThrow('Cookie error');
    expect(mockLogger.error).toHaveBeenCalled();
  });
});

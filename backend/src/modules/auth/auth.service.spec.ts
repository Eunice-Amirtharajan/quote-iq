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
    findFirst: jest.fn(),
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
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);
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
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login('marcus@quoteiq.com', 'wrongpassword', mockResponse),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('signs JWT with correct payload', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.login('marcus@quoteiq.com', 'password123', mockResponse);

      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
      });
    });

    it('does not set cookie when login fails', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      await expect(
        service.login('wrong@email.com', 'password123', mockResponse),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockResponse.cookie).not.toHaveBeenCalled();
    });
    it('throws when JWT signing fails', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockJwtService.sign.mockImplementation(() => {
        throw new Error('JWT error');
      });

      await expect(
        service.login('marcus@quoteiq.com', 'password123', mockResponse),
      ).rejects.toThrow('JWT error');
    });

    it('logs String(error) when a non-Error is thrown during token setup', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockJwtService.sign.mockImplementation(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'plain string error';
      });

      await expect(
        service.login('marcus@quoteiq.com', 'password123', mockResponse),
      ).rejects.toBe('plain string error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(String),
        'plain string error',
        AuthService.name,
      );
    });

    it('sets secure:true and sameSite:none in production', async () => {
      const savedEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      mockJwtService.sign.mockReturnValue('mock-jwt-token');
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.login('marcus@quoteiq.com', 'password123', mockResponse);

      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'access_token',
        expect.any(String),
        expect.objectContaining({ secure: true, sameSite: 'none' }),
      );
      process.env.NODE_ENV = savedEnv;
    });

    it('uses default JWT_EXPIRES_IN of 7d when env var is not set', async () => {
      const saved = process.env.JWT_EXPIRES_IN;
      delete process.env.JWT_EXPIRES_IN;
      mockJwtService.sign.mockReturnValue('mock-jwt-token');
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.login('marcus@quoteiq.com', 'password123', mockResponse);

      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'access_token',
        expect.any(String),
        expect.objectContaining({ maxAge: 7 * 24 * 60 * 60 * 1000 }),
      );
      process.env.JWT_EXPIRES_IN = saved;
    });
  });

  describe('logout', () => {
    it('clears the access_token cookie', () => {
      const result = service.logout(mockResponse);
      expect(mockResponse.clearCookie).toHaveBeenCalledWith('access_token', {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
      });
      expect(result).toBe(true);
    });

    it('uses secure:true and sameSite:none in production', () => {
      const savedEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      service.logout(mockResponse);

      expect(mockResponse.clearCookie).toHaveBeenCalledWith(
        'access_token',
        expect.objectContaining({ secure: true, sameSite: 'none' }),
      );
      process.env.NODE_ENV = savedEnv;
    });

    it('logs String(error) when a non-Error is thrown during clearCookie', () => {
      const errorResponse = {
        clearCookie: jest.fn().mockImplementation(() => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw 'plain string error';
        }),
      } as unknown as Response;

      expect(() => service.logout(errorResponse)).toThrow('plain string error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.any(String),
        'plain string error',
        AuthService.name,
      );
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

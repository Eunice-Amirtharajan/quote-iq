jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import { AppLogger } from '../../common/logger/logger.service';
import { TokenStoreService } from '../../common/token-store/token-store.service';
import { MailService } from '../../common/mail/mail.service';
import * as bcrypt from 'bcrypt';
import { Response } from 'express';

const mockPrismaService = {
  user: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
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
        { provide: TokenStoreService, useValue: { set: jest.fn(), get: jest.fn(), del: jest.fn() } },
        { provide: MailService, useValue: { sendMail: jest.fn() } },
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
        throw 'plain string error'; // NOSONAR — intentionally testing non-Error throw handling
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

  describe('salesReps', () => {
    it('returns all users with SALES_REP role ordered by name', async () => {
      const mockReps = [
        { id: 'u-1', name: 'Anna Schmidt', role: 'SALES_REP' },
        { id: 'u-2', name: 'Ben Müller', role: 'SALES_REP' },
      ];
      mockPrismaService.user.findMany.mockResolvedValue(mockReps);

      const result = await service.salesReps();

      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith({
        where: { role: 'SALES_REP' },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      });
      expect(result).toEqual(mockReps);
    });

    it('returns empty array when no reps exist', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([]);
      const result = await service.salesReps();
      expect(result).toEqual([]);
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

  describe('inviteUser', () => {
    let tokenStore: { set: jest.Mock; get: jest.Mock; del: jest.Mock };
    let mailService: { sendMail: jest.Mock };

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AuthService,
          { provide: PrismaService, useValue: mockPrismaService },
          { provide: JwtService, useValue: mockJwtService },
          { provide: AppLogger, useValue: mockLogger },
          { provide: TokenStoreService, useValue: { set: jest.fn(), get: jest.fn(), del: jest.fn() } },
          { provide: MailService, useValue: { sendMail: jest.fn() } },
        ],
      }).compile();

      service = module.get<AuthService>(AuthService);
      tokenStore = module.get(TokenStoreService);
      mailService = module.get(MailService);
    });

    it('creates user, stores token, and sends invite email', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue({ id: 'u-new', name: 'Alice', email: 'alice@test.com', role: 'SALES_REP' });

      const result = await service.inviteUser('Alice', 'alice@test.com', 'SALES_REP' as any);

      expect(result).toBe(true);
      expect(mockPrismaService.user.create).toHaveBeenCalledWith({
        data: { name: 'Alice', email: 'alice@test.com', role: 'SALES_REP', password: null },
      });
      expect(tokenStore.set).toHaveBeenCalledWith(
        expect.stringMatching(/^invite:/),
        'u-new',
        expect.any(Number),
      );
      expect(mailService.sendMail).toHaveBeenCalledWith(
        'alice@test.com',
        expect.stringContaining('invited'),
        expect.any(String),
      );
    });

    it('throws BadRequestException when email already exists', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({ id: 'u-existing' });

      await expect(service.inviteUser('Alice', 'alice@test.com', 'SALES_REP' as any))
        .rejects.toThrow(BadRequestException);

      expect(mockPrismaService.user.create).not.toHaveBeenCalled();
    });
  });

  describe('acceptInvite', () => {
    let tokenStore: { set: jest.Mock; get: jest.Mock; del: jest.Mock };

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AuthService,
          { provide: PrismaService, useValue: mockPrismaService },
          { provide: JwtService, useValue: mockJwtService },
          { provide: AppLogger, useValue: mockLogger },
          { provide: TokenStoreService, useValue: { set: jest.fn(), get: jest.fn(), del: jest.fn() } },
          { provide: MailService, useValue: { sendMail: jest.fn() } },
        ],
      }).compile();

      service = module.get<AuthService>(AuthService);
      tokenStore = module.get(TokenStoreService);
    });

    it('sets password and deletes token on valid invite token', async () => {
      tokenStore.get.mockResolvedValue('u-123');
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-pw');
      mockPrismaService.user.update.mockResolvedValue({});

      const result = await service.acceptInvite('valid-token', 'newpassword');

      expect(result).toBe(true);
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'u-123' },
        data: { password: 'hashed-pw' },
      });
      expect(tokenStore.del).toHaveBeenCalledWith('invite:valid-token');
    });

    it('throws BadRequestException when invite token is invalid', async () => {
      tokenStore.get.mockResolvedValue(null);

      await expect(service.acceptInvite('bad-token', 'newpassword'))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('requestPasswordReset', () => {
    let tokenStore: { set: jest.Mock; get: jest.Mock; del: jest.Mock };
    let mailService: { sendMail: jest.Mock };

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AuthService,
          { provide: PrismaService, useValue: mockPrismaService },
          { provide: JwtService, useValue: mockJwtService },
          { provide: AppLogger, useValue: mockLogger },
          { provide: TokenStoreService, useValue: { set: jest.fn(), get: jest.fn(), del: jest.fn() } },
          { provide: MailService, useValue: { sendMail: jest.fn() } },
        ],
      }).compile();

      service = module.get<AuthService>(AuthService);
      tokenStore = module.get(TokenStoreService);
      mailService = module.get(MailService);
    });

    it('stores reset token and sends email for valid user with password', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({ id: 'u-1', email: 'user@test.com', password: 'hashed' });

      await service.requestPasswordReset('user@test.com');

      expect(tokenStore.set).toHaveBeenCalledWith(
        expect.stringMatching(/^reset:/),
        'u-1',
        expect.any(Number),
      );
      expect(mailService.sendMail).toHaveBeenCalledWith(
        'user@test.com',
        expect.stringContaining('Reset'),
        expect.any(String),
      );
    });

    it('returns silently when email does not exist (no enumeration)', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      await expect(service.requestPasswordReset('nobody@test.com')).resolves.toBeUndefined();
      expect(tokenStore.set).not.toHaveBeenCalled();
    });

    it('returns silently when user has no password (invited user, not yet activated)', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({ id: 'u-1', email: 'user@test.com', password: null });

      await expect(service.requestPasswordReset('user@test.com')).resolves.toBeUndefined();
      expect(tokenStore.set).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    let tokenStore: { set: jest.Mock; get: jest.Mock; del: jest.Mock };

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AuthService,
          { provide: PrismaService, useValue: mockPrismaService },
          { provide: JwtService, useValue: mockJwtService },
          { provide: AppLogger, useValue: mockLogger },
          { provide: TokenStoreService, useValue: { set: jest.fn(), get: jest.fn(), del: jest.fn() } },
          { provide: MailService, useValue: { sendMail: jest.fn() } },
        ],
      }).compile();

      service = module.get<AuthService>(AuthService);
      tokenStore = module.get(TokenStoreService);
    });

    it('updates password and deletes token on valid reset token', async () => {
      tokenStore.get.mockResolvedValue('u-1');
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hashed');
      mockPrismaService.user.update.mockResolvedValue({});

      const result = await service.resetPassword('valid-reset-token', 'newpassword');

      expect(result).toBe(true);
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'u-1' },
        data: { password: 'new-hashed' },
      });
      expect(tokenStore.del).toHaveBeenCalledWith('reset:valid-reset-token');
    });

    it('throws BadRequestException when reset token is invalid', async () => {
      tokenStore.get.mockResolvedValue(null);

      await expect(service.resetPassword('bad-token', 'newpassword'))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('getUserById', () => {
    it('returns user when found', async () => {
      const mockUser = { id: 'u-1', name: 'Alice', email: 'alice@test.com', role: 'SALES_REP' };
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.getUserById('u-1');

      expect(result).toEqual(mockUser);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({ where: { id: 'u-1' } });
    });

    it('throws NotFoundException when user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.getUserById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('listUsers', () => {
    it('returns all users ordered by name', async () => {
      const users = [
        { id: 'u-1', name: 'Alice' },
        { id: 'u-2', name: 'Bob' },
      ];
      mockPrismaService.user.findMany.mockResolvedValue(users);

      const result = await service.listUsers();

      expect(result).toEqual(users);
      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith({ orderBy: { name: 'asc' } });
    });

    it('returns empty array when no users exist', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([]);
      const result = await service.listUsers();
      expect(result).toEqual([]);
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../../prisma/prisma.service';
import { AppLogger } from '../../common/logger/logger.service';
import { UnauthorizedException } from '@nestjs/common';

const mockPrismaService = {
  user: {
    findFirst: jest.fn(),
  },
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

describe('JwtStrategy — missing JWT_SECRET', () => {
  it('throws at construction when JWT_SECRET is not set', async () => {
    const saved = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    await expect(
      Test.createTestingModule({
        providers: [
          JwtStrategy,
          { provide: PrismaService, useValue: mockPrismaService },
          { provide: AppLogger, useValue: mockLogger },
        ],
      }).compile(),
    ).rejects.toThrow('JWT_SECRET is not set');
    process.env.JWT_SECRET = saved;
  });
});

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(async () => {
    process.env.JWT_SECRET = 'test-secret';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AppLogger, useValue: mockLogger },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  afterEach(() => jest.clearAllMocks());

  describe('validate', () => {
    const payload = {
      sub: 'user-1',
      email: 'marcus@quoteiq.com',
      role: 'SALES_MANAGER',
    };

    it('returns user when valid payload and user is active', async () => {
      const mockUser = { id: 'user-1', email: 'marcus@quoteiq.com', isActive: true };
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);

      const result = await strategy.validate(payload);

      expect(result).toEqual(mockUser);
      expect(mockPrismaService.user.findFirst).toHaveBeenCalledWith({
        where: { id: 'user-1', isActive: true },
      });
    });

    it('throws UnauthorizedException when user not found', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      await expect(strategy.validate(payload)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when user is deactivated', async () => {
      // findFirst with isActive: true returns null for deactivated users
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      await expect(strategy.validate(payload)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockPrismaService.user.findFirst).toHaveBeenCalledWith({
        where: { id: 'user-1', isActive: true },
      });
    });
  });
});

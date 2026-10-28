import { JwtService } from '@nestjs/jwt';
import { SocketAuthService } from './socket-auth.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AppLogger } from '../../common/logger/logger.service';

const SECRET = 'test-secret';
const jwt = new JwtService({ secret: SECRET });
const mockPrisma = { user: { findFirst: jest.fn() } };
const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

const service = new SocketAuthService(
  jwt,
  mockPrisma as unknown as PrismaService,
  mockLogger as unknown as AppLogger,
);

const tokenFor = (sub: string, options: { expiresIn?: number } = {}) =>
  jwt.sign(
    { sub, email: 'marcus@quoteiq.com', role: 'SALES_MANAGER' },
    options,
  );

describe('SocketAuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'u-1',
      role: 'SALES_MANAGER',
    });
  });

  it('authenticates the browser by its session cookie', async () => {
    const user = await service.authenticate({
      headers: { cookie: `theme=dark; access_token=${tokenFor('u-1')}; x=1` },
    });

    expect(user).toEqual({ id: 'u-1', role: 'SALES_MANAGER' });
    // Same rule as JwtStrategy: the user must still exist and be active
    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'u-1', isActive: true },
      select: { id: true, role: true },
    });
  });

  it('accepts a token passed in auth.token by non-browser clients', async () => {
    await expect(
      service.authenticate({ headers: {}, auth: { token: tokenFor('u-1') } }),
    ).resolves.toEqual({ id: 'u-1', role: 'SALES_MANAGER' });
  });

  it('decodes a URL-encoded cookie value', async () => {
    const encoded = encodeURIComponent(tokenFor('u-1'));
    await expect(
      service.authenticate({ headers: { cookie: `access_token=${encoded}` } }),
    ).resolves.toEqual({ id: 'u-1', role: 'SALES_MANAGER' });
  });

  it('rejects a connection without a session', async () => {
    await expect(
      service.authenticate({ headers: { cookie: 'theme=dark' } }),
    ).resolves.toBeNull();
    await expect(service.authenticate({ headers: {} })).resolves.toBeNull();
    expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('rejects a forged or expired token without touching the database', async () => {
    const forged = new JwtService({ secret: 'someone-else' }).sign({
      sub: 'u-1',
    });
    const expired = tokenFor('u-1', { expiresIn: -10 });

    for (const token of [forged, expired, 'not-a-jwt']) {
      await expect(
        service.authenticate({ headers: { cookie: `access_token=${token}` } }),
      ).resolves.toBeNull();
    }
    expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('rejects a deactivated or deleted user', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    await expect(
      service.authenticate({
        headers: { cookie: `access_token=${tokenFor('u-1')}` },
      }),
    ).resolves.toBeNull();
  });
});

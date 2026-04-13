import { RolesGuard } from './roles.guard';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { Role } from '@prisma/client';

jest.mock('@nestjs/graphql', () => ({
  GqlExecutionContext: {
    create: jest.fn(),
  },
}));

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;
    guard = new RolesGuard(reflector);
  });

  const mockContext = (role: string) => {
    const mockUser = { role };
    (GqlExecutionContext.create as jest.Mock).mockReturnValue({
      getContext: () => ({ req: { user: mockUser } }),
    });
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;
  };

  it('allows access when no roles required', () => {
    reflector.getAllAndOverride.mockReturnValue(null);
    const result = guard.canActivate(mockContext('SALES_REP'));
    expect(result).toBe(true);
  });

  it('allows access when user has required role', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.SALES_MANAGER]);
    const result = guard.canActivate(mockContext('SALES_MANAGER'));
    expect(result).toBe(true);
  });

  it('denies access when user does not have required role', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.SALES_MANAGER]);
    const result = guard.canActivate(mockContext('SALES_REP'));
    expect(result).toBe(false);
  });

  it('allows access for ADMIN when SALES_MANAGER required', () => {
    reflector.getAllAndOverride.mockReturnValue([
      Role.SALES_MANAGER,
      Role.ADMIN,
    ]);
    const result = guard.canActivate(mockContext('ADMIN'));
    expect(result).toBe(true);
  });
});

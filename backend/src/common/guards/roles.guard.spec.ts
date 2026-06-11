import { RolesGuard } from './roles.guard';
import { Reflector } from '@nestjs/core';
import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
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

  it('throws ForbiddenException when no roles configured (misconfiguration guard)', () => {
    reflector.getAllAndOverride.mockReturnValue(null);
    expect(() => guard.canActivate(mockContext('SALES_REP'))).toThrow(
      ForbiddenException,
    );
  });

  it('allows access when user has required role', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.SALES_MANAGER]);
    const result = guard.canActivate(mockContext('SALES_MANAGER'));
    expect(result).toBe(true);
  });

  it('throws ForbiddenException when user does not have required role', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.SALES_MANAGER]);
    expect(() => guard.canActivate(mockContext('SALES_REP'))).toThrow(
      ForbiddenException,
    );
  });

  it('throws UnauthorizedException when user is undefined', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.SALES_MANAGER]);
    (GqlExecutionContext.create as jest.Mock).mockReturnValue({
      getContext: () => ({ req: { user: undefined } }),
    });
    const ctx = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });
});

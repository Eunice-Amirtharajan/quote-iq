import { JwtAuthGuard } from './jwt-auth.guard';
import { ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

jest.mock('@nestjs/graphql', () => ({
  GqlExecutionContext: { create: jest.fn() },
}));

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;

  beforeEach(() => {
    guard = new JwtAuthGuard();
  });

  it('extracts request from GraphQL context', () => {
    const mockReq = { cookies: { access_token: 'token' } };
    (GqlExecutionContext.create as jest.Mock).mockReturnValue({
      getContext: () => ({ req: mockReq }),
    });

    const mockContext = {
      getType: () => 'graphql',
      getHandler: jest.fn(),
      getClass: jest.fn(),
    } as unknown as ExecutionContext;

    const result = guard.getRequest(mockContext);
    expect(result).toEqual(mockReq);
  });

  it('extracts request directly for plain HTTP context', () => {
    const mockReq = { headers: { authorization: 'Bearer token' } };
    const mockContext = {
      getType: () => 'http',
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({ getRequest: () => mockReq }),
    } as unknown as ExecutionContext;

    const result = guard.getRequest(mockContext);
    expect(result).toEqual(mockReq);
  });
});

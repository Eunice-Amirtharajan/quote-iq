import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { ThrottlerStorage } from '@nestjs/throttler';
import { GqlThrottlerGuard } from './gql-throttler.guard';

jest.mock('@nestjs/graphql', () => ({
  GqlExecutionContext: { create: jest.fn() },
}));

const stubStorage = { increment: jest.fn() } as unknown as ThrottlerStorage;
const stubReflector = new Reflector();

const makeThrottlerGuard = () => {
  // Minimal stub — only the method under test is exercised
  return new GqlThrottlerGuard(
    { throttlers: [{ ttl: 60_000, limit: 100 }] },
    stubStorage,
    stubReflector,
  );
};

describe('GqlThrottlerGuard', () => {
  afterEach(() => jest.clearAllMocks());

  describe('getRequestResponse', () => {
    it('returns req and res from GraphQL context when present', () => {
      const mockReq = { ip: '127.0.0.1' };
      const mockRes = { setHeader: jest.fn() };
      (GqlExecutionContext.create as jest.Mock).mockReturnValue({
        getContext: () => ({ req: mockReq, res: mockRes }),
      });

      const guard = makeThrottlerGuard();
      const ctx = {
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: jest.fn(),
      } as unknown as ExecutionContext;

      const result = guard.getRequestResponse(ctx);

      expect(result.req).toBe(mockReq);
      expect(result.res).toBe(mockRes);
    });

    it('falls back to super.getRequestResponse when GraphQL context has no req', () => {
      (GqlExecutionContext.create as jest.Mock).mockReturnValue({
        getContext: () => ({}),
      });

      const guard = makeThrottlerGuard();
      const mockHttpReq = { ip: '10.0.0.1' };
      const mockHttpRes = {};
      // Stub the parent class method
      jest
        .spyOn(
          Object.getPrototypeOf(GqlThrottlerGuard.prototype),
          'getRequestResponse',
        )
        .mockReturnValue({ req: mockHttpReq, res: mockHttpRes });

      const ctx = {
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: () => mockHttpReq,
          getResponse: () => mockHttpRes,
        }),
      } as unknown as ExecutionContext;

      const result = guard.getRequestResponse(ctx);

      expect(result.req).toBe(mockHttpReq);
      expect(result.res).toBe(mockHttpRes);
    });

    it('falls back to super when GraphQL context is null', () => {
      (GqlExecutionContext.create as jest.Mock).mockReturnValue({
        getContext: () => null,
      });

      const guard = makeThrottlerGuard();
      const mockHttpReq = { ip: '10.0.0.2' };
      const mockHttpRes = {};
      jest
        .spyOn(
          Object.getPrototypeOf(GqlThrottlerGuard.prototype),
          'getRequestResponse',
        )
        .mockReturnValue({ req: mockHttpReq, res: mockHttpRes });

      const ctx = {
        getHandler: jest.fn(),
        getClass: jest.fn(),
      } as unknown as ExecutionContext;

      const result = guard.getRequestResponse(ctx);
      expect(result.req).toBe(mockHttpReq);
    });
  });
});

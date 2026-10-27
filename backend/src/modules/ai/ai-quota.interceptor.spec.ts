import { HttpException, HttpStatus, type CallHandler } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { defer, firstValueFrom } from 'rxjs';
import { AiQuotaInterceptor } from './ai-quota.interceptor';
import { currentAiUser } from './ai-quota.service';

const quota = { assertRate: jest.fn() };
const interceptor = new AiQuotaInterceptor(quota as never);

const withUser = (user?: { id: string }) =>
  jest
    .spyOn(GqlExecutionContext, 'create')
    .mockReturnValue({ getContext: () => ({ req: { user } }) } as never);

// Like Nest: the resolver runs when the handler's observable is subscribed to
const handler = (): CallHandler & { calls: number } => {
  const h = {
    calls: 0,
    handle: () =>
      defer(() => {
        h.calls += 1;
        return Promise.resolve(currentAiUser());
      }),
  };
  return h;
};

describe('AiQuotaInterceptor', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    quota.assertRate.mockReset();
  });

  it('checks the rate, then runs the resolver as the user', async () => {
    withUser({ id: 'u-1' });
    const next = handler();
    const ranAs = await firstValueFrom(
      interceptor.intercept({} as never, next),
    );
    expect(quota.assertRate).toHaveBeenCalledWith('u-1');
    expect(ranAs).toBe('u-1');
  });

  it('does not run the resolver when the user is over the rate', async () => {
    withUser({ id: 'u-1' });
    quota.assertRate.mockImplementation(() => {
      throw new HttpException('Too many', HttpStatus.TOO_MANY_REQUESTS);
    });
    const next = handler();
    await expect(
      firstValueFrom(interceptor.intercept({} as never, next)),
    ).rejects.toThrow('Too many');
    expect(next.calls).toBe(0);
  });

  it('passes through when there is no user (the auth guard handles that case)', async () => {
    withUser(undefined);
    const ranAs = await firstValueFrom(
      interceptor.intercept({} as never, handler()),
    );
    expect(quota.assertRate).not.toHaveBeenCalled();
    expect(ranAs).toBeUndefined();
  });
});

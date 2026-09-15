import { ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';

@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    // RabbitMQ handlers have no HTTP context — skip throttling entirely
    const type = context.getType<string>();
    if (type !== 'http' && type !== 'graphql') {
      return true;
    }
    // /metrics is a plain HTTP route used by Prometheus — skip throttling
    if (type === 'http') {
      const req = context.switchToHttp().getRequest<{ url?: string }>();
      if (req?.url?.startsWith('/metrics')) return true;
    }
    return super.canActivate(context);
  }

  getRequestResponse(context: ExecutionContext): {
    req: Record<string, unknown>;
    res: Record<string, unknown>;
  } {
    const type = context.getType<string>();
    if (type === 'http') {
      // Plain HTTP (REST endpoints) — use the HTTP context directly
      const http = context.switchToHttp();
      return {
        req: http.getRequest<Record<string, unknown>>(),
        res: http.getResponse<Record<string, unknown>>(),
      };
    }
    // GraphQL — extract req/res from Apollo context
    const gqlCtx = GqlExecutionContext.create(context);
    const ctx = gqlCtx.getContext<{
      req: Record<string, unknown>;
      res: Record<string, unknown>;
    }>();
    if (!ctx?.req) {
      return super.getRequestResponse(context);
    }
    return { req: ctx.req, res: ctx.res };
  }

  protected override throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    return super.throwThrottlingException(context, throttlerLimitDetail);
  }
}

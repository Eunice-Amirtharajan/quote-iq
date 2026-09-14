import { ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    // RabbitMQ handlers have no HTTP context — skip throttling entirely
    const type = context.getType<string>();
    if (type !== 'http' && type !== 'graphql') {
      return true;
    }
    return super.canActivate(context);
  }

  getRequestResponse(context: ExecutionContext): {
    req: Record<string, unknown>;
    res: Record<string, unknown>;
  } {
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
}

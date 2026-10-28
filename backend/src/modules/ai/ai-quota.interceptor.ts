import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { defer, Observable } from 'rxjs';
import { AiQuotaService, runAsAiUser } from './ai-quota.service';

/**
 * Applies the per-user AI rate limit to an AI operation, then runs it as that user so its tokens
 * are charged to them and checked against their daily budget. Runs after the guards, so
 * JwtAuthGuard has already set the user.
 */
@Injectable()
export class AiQuotaInterceptor implements NestInterceptor {
  constructor(private readonly quota: AiQuotaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = GqlExecutionContext.create(context).getContext<{
      req: { user?: { id: string } };
    }>().req;
    const userId = req.user?.id;
    if (!userId) return next.handle();
    // defer turns a rate-limit throw into an error the GraphQL layer reports as the 429
    return defer(() => {
      this.quota.assertRate(userId);
      return new Observable<unknown>((subscriber) =>
        runAsAiUser(userId, () => next.handle().subscribe(subscriber)),
      );
    });
  }
}

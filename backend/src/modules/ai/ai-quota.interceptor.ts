import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { from, Observable, switchMap } from 'rxjs';
import { AiQuotaService, runAsAiUser } from './ai-quota.service';

/**
 * Applies the per-user AI limits to an AI operation, then runs it as that user so its tokens
 * are charged to them. Runs after the guards, so JwtAuthGuard has already set the user.
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
    return from(this.quota.assertAllowed(userId)).pipe(
      switchMap(
        () =>
          new Observable<unknown>((subscriber) =>
            runAsAiUser(userId, () => next.handle().subscribe(subscriber)),
          ),
      ),
    );
  }
}

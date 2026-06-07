import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { Role } from '@prisma/client';
import type { UserType } from '../../modules/users/user.entity';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No @Roles() decorator means the endpoint was not intended to be protected
    // by this guard — treat as a resolver misconfiguration rather than silently
    // denying (which would mask bugs in guard setup).
    if (!required) {
      throw new ForbiddenException('No roles configured for this endpoint');
    }

    const ctx = GqlExecutionContext.create(context);
    const user = ctx.getContext<{ req: { user: UserType } }>().req.user;

    if (!user) {
      throw new UnauthorizedException();
    }

    if (!required.includes(user.role)) {
      throw new ForbiddenException();
    }

    return true;
  }
}

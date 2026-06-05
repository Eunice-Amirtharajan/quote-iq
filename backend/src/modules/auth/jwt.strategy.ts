import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService, withDbRetry } from '../../prisma/prisma.service';
import { AppLogger } from '../../common/logger/logger.service';
import { Request } from 'express';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET is not set');
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request & { cookies: Record<string, string> }) =>
          req?.cookies['access_token'] ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: { sub: string; email: string; role: string }) {
    // DB lookup on every request detects deactivated or deleted users.
    // Acceptable at this scale; a token blocklist would be the alternative.
    const user = await withDbRetry(
      () => this.prisma.user.findFirst({ where: { id: payload.sub } }),
      this.logger,
    );
    if (!user) throw new UnauthorizedException();
    return user;
  }
}

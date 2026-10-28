import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { PrismaService, withDbRetry } from '../../prisma/prisma.service';
import { AppLogger } from '../../common/logger/logger.service';

/** What a connected socket is allowed to know about its user. */
export interface SocketUser {
  id: string;
  role: Role;
}

/** The parts of a socket.io handshake used to authenticate it. */
export interface SocketHandshake {
  headers: { cookie?: string };
  auth?: { token?: unknown };
}

const SESSION_COOKIE = 'access_token';

/**
 * Authenticates a WebSocket connection the same way JwtStrategy authenticates HTTP requests:
 * the session token (cookie, or `auth.token` for non-browser clients), a valid signature and
 * expiry, and a user who still exists and is active. Without it, any client could connect.
 */
@Injectable()
export class SocketAuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {}

  /** The authenticated user, or null when the handshake carries no valid session. */
  async authenticate(handshake: SocketHandshake): Promise<SocketUser | null> {
    const token = tokenFrom(handshake);
    if (!token) return null;
    let userId: string;
    try {
      userId = (await this.jwt.verifyAsync<{ sub: string }>(token)).sub;
    } catch {
      return null; // bad signature or expired
    }
    const user = await withDbRetry(
      () =>
        this.prisma.user.findFirst({
          where: { id: userId, isActive: true },
          select: { id: true, role: true },
        }),
      this.logger,
    );
    return user ?? null;
  }
}

function tokenFrom(handshake: SocketHandshake): string | undefined {
  const { token } = handshake.auth ?? {};
  if (typeof token === 'string' && token.length > 0) return token;
  for (const part of (handshake.headers.cookie ?? '').split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === SESSION_COOKIE && value.length > 0) {
      return decodeURIComponent(value.join('='));
    }
  }
  return undefined;
}

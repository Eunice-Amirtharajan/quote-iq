import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService, withDbRetry } from '../../prisma/prisma.service';
import { Response } from 'express';
import * as bcrypt from 'bcrypt';
import * as crypto from 'node:crypto';
import { AppLogger } from '../../common/logger/logger.service';
import type { User } from '@prisma/client';
import { Role } from '@prisma/client';
import ms, { StringValue } from 'ms';
import { TokenStoreService } from '../../common/token-store/token-store.service';
import { MailService } from '../../common/mail/mail.service';
import {
  inviteEmailHtml,
  passwordResetEmailHtml,
} from '../../common/mail/mail.templates';

const INVITE_TTL = 60 * 60 * 24; // 24 hours
const RESET_TTL = 60 * 60; // 1 hour
const BCRYPT_ROUNDS = 12;

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly logger: AppLogger,
    private readonly tokenStore: TokenStoreService,
    private readonly mailService: MailService,
  ) {}

  async login(email: string, password: string, res: Response): Promise<User> {
    this.logger.info(`Login attempt`, AuthService.name);
    const user = await withDbRetry(
      () => this.prisma.user.findFirst({ where: { email, isActive: true } }),
      this.logger,
    );
    if (!user?.password) {
      this.logger.warn(
        `Login failed — user not found or no password set`,
        AuthService.name,
      );
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      this.logger.warn(`Login failed — wrong password`, AuthService.name);
      throw new UnauthorizedException('Invalid credentials');
    }

    try {
      const maxAge = ms((process.env.JWT_EXPIRES_IN ?? '7d') as StringValue);
      const token = this.jwtService.sign({
        sub: user.id,
        email: user.email,
        role: user.role,
      });

      const isProd = process.env.NODE_ENV === 'production';
      res.cookie('access_token', token, {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? 'none' : 'lax',
        maxAge: maxAge,
      });
      this.logger.info(
        `Login successful — userId: ${user.id}`,
        AuthService.name,
      );
      return user;
    } catch (error) {
      this.logger.error(
        `Unexpected error during login — userId: ${user.id}`,
        error instanceof Error ? error.stack : String(error),
        AuthService.name,
      );
      throw error;
    }
  }

  async salesReps(): Promise<Pick<User, 'id' | 'name'>[]> {
    return this.prisma.user.findMany({
      where: { role: Role.SALES_REP, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }

  logout(res: Response): boolean {
    try {
      const isProd = process.env.NODE_ENV === 'production';
      res.clearCookie('access_token', {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? 'none' : 'lax',
      });
      return true;
    } catch (error) {
      this.logger.error(
        `Logout failed`,
        error instanceof Error ? error.stack : String(error),
        AuthService.name,
      );
      throw error;
    }
  }

  async inviteUser(name: string, email: string, role: Role): Promise<boolean> {
    const existing = await this.prisma.user.findFirst({ where: { email } });
    if (existing && existing.isActive)
      throw new BadRequestException('A user with that email already exists');

    // Re-invite a previously deactivated user: reactivate them, wipe the old
    // password, and send a fresh invite link — same as a brand-new invite.
    const user = existing
      ? await this.prisma.user.update({
          where: { id: existing.id },
          data: { name, role, password: null, isActive: true },
        })
      : await this.prisma.user.create({
          data: { name, email, role, password: null },
        });

    const token = generateToken();
    await this.tokenStore.set(`invite:${token}`, user.id, INVITE_TTL);
    await this.tokenStore.set(`invite_uid:${user.id}`, token, INVITE_TTL);

    const appUrl = process.env.APP_URL;
    if (!appUrl) {
      this.logger.warn(
        'APP_URL is not set — invite link will point to http://localhost:5173 (only works on the local machine)',
        AuthService.name,
      );
    }
    const resolvedUrl = appUrl ?? 'http://localhost:5173';
    this.mailService.sendMail(
      email,
      "You've been invited to QuoteIQ",
      inviteEmailHtml(name, `${resolvedUrl}/invite/${token}`),
    );

    this.logger.info(`Invite sent — userId: ${user.id}`, AuthService.name);
    return true;
  }

  async acceptInvite(token: string, password: string): Promise<boolean> {
    const userId = await this.tokenStore.get(`invite:${token}`);
    if (!userId)
      throw new BadRequestException('Invalid or expired invite link');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive)
      throw new BadRequestException('Invalid or expired invite link');

    const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashed },
    });

    await this.tokenStore.del(`invite:${token}`);
    await this.tokenStore.del(`invite_uid:${userId}`);
    this.logger.info(`Invite accepted — userId: ${userId}`, AuthService.name);
    return true;
  }

  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.prisma.user.findFirst({ where: { email } });
    // Always return without error — never reveal whether an email exists
    if (!user?.password) return;

    const token = generateToken();
    await this.tokenStore.set(`reset:${token}`, user.id, RESET_TTL);
    await this.tokenStore.set(`reset_uid:${user.id}`, token, RESET_TTL);

    const appUrl = process.env.APP_URL;
    if (!appUrl) {
      this.logger.warn(
        'APP_URL is not set — password reset link will point to http://localhost:5173 (only works on the local machine)',
        AuthService.name,
      );
    }
    const resolvedUrl = appUrl ?? 'http://localhost:5173';
    this.mailService.sendMail(
      email,
      'Reset your QuoteIQ password',
      passwordResetEmailHtml(`${resolvedUrl}/reset-password/${token}`),
    );

    this.logger.info(
      `Password reset requested — userId: ${user.id}`,
      AuthService.name,
    );
  }

  async resetPassword(token: string, password: string): Promise<boolean> {
    const userId = await this.tokenStore.get(`reset:${token}`);
    if (!userId) throw new BadRequestException('Invalid or expired reset link');

    const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashed },
    });

    await this.tokenStore.del(`reset:${token}`);
    await this.tokenStore.del(`reset_uid:${userId}`);
    this.logger.info(
      `Password reset completed — userId: ${userId}`,
      AuthService.name,
    );
    return true;
  }

  async getUserById(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async listUsers(
    skip = 0,
    take = 50,
    search?: string,
  ): Promise<{ items: User[]; total: number }> {
    const where = search
      ? { isActive: true, name: { contains: search, mode: 'insensitive' as const } }
      : { isActive: true };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total };
  }

  async deactivateUser(id: string, requesterId: string): Promise<boolean> {
    if (id === requesterId)
      throw new BadRequestException('You cannot deactivate your own account');
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.isActive) throw new BadRequestException('User is already deactivated');

    await this.prisma.user.update({ where: { id }, data: { isActive: false } });

    // Invalidate any outstanding invite token for this user
    const pendingToken = await this.tokenStore.get(`invite_uid:${id}`);
    if (pendingToken) {
      await this.tokenStore.del(`invite:${pendingToken}`);
      await this.tokenStore.del(`invite_uid:${id}`);
    }

    this.logger.info(`User deactivated — userId: ${id}`, AuthService.name);
    return true;
  }

  /** @deprecated kept temporarily — remove once all callers use deactivateUser */
  async deleteUser(id: string, requesterId: string): Promise<boolean> {
    if (id === requesterId)
      throw new BadRequestException('You cannot delete your own account');
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    const quotationCount = await this.prisma.quotation.count({
      where: { createdById: id },
    });
    if (quotationCount > 0)
      throw new BadRequestException(
        `Cannot delete this user — they own ${quotationCount} quotation${quotationCount === 1 ? '' : 's'}. Reassign or delete their quotations first.`,
      );

    await this.prisma.user.delete({ where: { id } });
    this.logger.info(`User deleted — userId: ${id}`, AuthService.name);
    return true;
  }
}

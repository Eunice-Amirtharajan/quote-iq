import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { Response } from 'express';
import * as bcrypt from 'bcrypt';
import { AppLogger } from '../../common/logger/logger.service';
import type { User } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly logger: AppLogger,
  ) {}

  async login(email: string, password: string, res: Response): Promise<User> {
    this.logger.info(`Login attempt: ${email}`, AuthService.name);
    const user = (await this.prisma.user.findUnique({
      where: { email },
    })) as User;
    if (!user) {
      this.logger.warn(
        `Login failed — user not found: ${email}`,
        AuthService.name,
      );
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      this.logger.warn(
        `Login failed — wrong password: ${email}`,
        AuthService.name,
      );
      throw new UnauthorizedException('Invalid credentials');
    }

    try {
      const token = this.jwtService.sign({
        sub: user.id,
        email: user.email,
        role: user.role,
      });

      res.cookie('access_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      this.logger.info(`Login successful: ${user.id}`, AuthService.name);
      return user;
    } catch (error) {
      this.logger.error(
        `Unexpected error during login for: ${email}`,
        error instanceof Error ? error.stack : String(error),
        AuthService.name,
      );
      throw error;
    }
  }

  logout(res: Response): boolean {
    try {
      res.clearCookie('access_token');
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
}

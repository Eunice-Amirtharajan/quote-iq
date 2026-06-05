import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { Response } from 'express';
import * as bcrypt from 'bcrypt';
import { AppLogger } from '../../common/logger/logger.service';
import type { User } from '@prisma/client';
import ms, { StringValue } from 'ms';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly logger: AppLogger,
  ) {}

  async login(email: string, password: string, res: Response): Promise<User> {
    this.logger.info(`Login attempt`, AuthService.name);
    const user = await this.prisma.user.findUnique({
      where: { email },
    });
    if (!user) {
      this.logger.warn(`Login failed — user not found`, AuthService.name);
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      this.logger.warn(
        `Login failed — wrong password — userId: ${user.id}`,
        AuthService.name,
      );
      throw new UnauthorizedException('Invalid credentials');
    }

    try {
      const maxAge = ms((process.env.JWT_EXPIRES_IN ?? '7d') as StringValue);
      const token = this.jwtService.sign({
        sub: user.id,
        email: user.email,
        role: user.role,
      });

      res.cookie('access_token', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
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

  logout(res: Response): boolean {
    try {
      res.clearCookie('access_token', {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
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
}

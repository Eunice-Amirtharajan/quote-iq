import { Controller, Get, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { HealthService } from './health.service';

// Liveness stays at GET /health (main.ts): no dependencies, so a DB outage never restarts the pod.
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response) {
    const { ready, status, checks } = await this.health.readiness();
    res.status(ready ? 200 : 503);
    return { status, checks };
  }
}

import { Injectable } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { PrismaService } from '../../prisma/prisma.service';

const DB_CHECK_TIMEOUT_MS = 3_000;

type CheckStatus = 'up' | 'down';

export interface Readiness {
  ready: boolean;
  status: 'ok' | 'degraded' | 'unavailable' | 'shutting_down';
  checks: { database?: CheckStatus; rabbitmq?: CheckStatus };
}

/**
 * Readiness: should the load balancer send this instance traffic? Fails when the database is
 * unreachable or the process is shutting down. RabbitMQ being down only makes the instance
 * "degraded": quote events wait in the outbox, so every request can still be served.
 */
@Injectable()
export class HealthService {
  private shuttingDown = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly amqp: AmqpConnection,
  ) {}

  /** Called on SIGTERM so the load balancer stops routing here before the server closes. */
  markShuttingDown(): void {
    this.shuttingDown = true;
  }

  async readiness(): Promise<Readiness> {
    if (this.shuttingDown) {
      return { ready: false, status: 'shutting_down', checks: {} };
    }
    const database = await this.checkDatabase();
    const rabbitmq: CheckStatus = this.amqp.managedConnection.isConnected()
      ? 'up'
      : 'down';
    if (database === 'down') {
      return {
        ready: false,
        status: 'unavailable',
        checks: { database, rabbitmq },
      };
    }
    return {
      ready: true,
      status: rabbitmq === 'up' ? 'ok' : 'degraded',
      checks: { database, rabbitmq },
    };
  }

  private async checkDatabase(): Promise<CheckStatus> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error('database check timed out')),
        DB_CHECK_TIMEOUT_MS,
      );
    });
    try {
      await Promise.race([this.prisma.$queryRaw`SELECT 1`, timeout]);
      return 'up';
    } catch {
      return 'down';
    } finally {
      clearTimeout(timer);
    }
  }
}

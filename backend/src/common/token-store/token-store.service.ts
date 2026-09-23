import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class TokenStoreService implements OnModuleDestroy {
  private readonly logger = new Logger(TokenStoreService.name);
  private readonly redis: Redis | null = null;
  private readonly memory = new Map<string, { value: string; expiresAt: number }>();

  constructor() {
    if (process.env.REDIS_URL) {
      this.redis = new Redis(process.env.REDIS_URL, { lazyConnect: false });
      this.redis.on('error', (err) =>
        this.logger.error('Redis connection error', err instanceof Error ? err.stack : String(err)),
      );
    } else {
      this.logger.warn('REDIS_URL not set — using in-memory token store (tokens lost on restart)');
    }
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (this.redis) {
      await this.redis.set(key, value, 'EX', ttlSeconds);
    } else {
      this.memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    }
  }

  async get(key: string): Promise<string | null> {
    if (this.redis) {
      return this.redis.get(key);
    }
    const entry = this.memory.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.memory.delete(key);
      return null;
    }
    return entry.value;
  }

  async del(key: string): Promise<void> {
    if (this.redis) {
      await this.redis.del(key);
    } else {
      this.memory.delete(key);
    }
  }

  onModuleDestroy() {
    this.redis?.disconnect();
  }
}

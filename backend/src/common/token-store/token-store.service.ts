import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { describeError } from '../helper/helper';

/**
 * Invite and password-reset tokens. Redis when REDIS_URL is set and reachable, otherwise an
 * in-memory map. A Redis that is set but down must not break invites and resets: commands fail
 * fast instead of queueing, writes fall back to memory, and reads check memory too, so a token
 * written during an outage still works after Redis comes back.
 */
@Injectable()
export class TokenStoreService implements OnModuleDestroy {
  private readonly logger = new Logger(TokenStoreService.name);
  private readonly redis: Redis | null = null;
  private readonly memory = new Map<
    string,
    { value: string; expiresAt: number }
  >();
  // Log an outage once, not on every reconnect attempt
  private redisDown = false;

  constructor() {
    if (process.env.REDIS_URL) {
      this.redis = new Redis(process.env.REDIS_URL, {
        lazyConnect: false,
        // Fail commands immediately while disconnected instead of holding the request
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        // Keep reconnecting in the background, backing off to every 30 s
        retryStrategy: (times) => Math.min(times * 1000, 30_000),
      });
      this.redis.on('error', (err) => {
        if (this.redisDown) return;
        this.redisDown = true;
        this.logger.error('Redis connection error', describeError(err));
        this.logger.warn(
          'Using the in-memory token store until Redis is reachable again',
        );
      });
      this.redis.on('ready', () => {
        if (!this.redisDown) return;
        this.redisDown = false;
        this.logger.log('Redis reconnected');
      });
    } else {
      this.logger.warn(
        'REDIS_URL not set — using in-memory token store (tokens lost on restart)',
      );
    }
  }

  private get redisReady(): boolean {
    return this.redis?.status === 'ready';
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (this.redisReady) {
      try {
        await this.redis!.set(key, value, 'EX', ttlSeconds);
        return;
      } catch (err) {
        this.logger.warn(
          `Redis set failed, storing in memory: ${describeError(err)}`,
        );
      }
    }
    this.memory.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async get(key: string): Promise<string | null> {
    if (this.redisReady) {
      try {
        const value = await this.redis!.get(key);
        if (value !== null) return value;
      } catch (err) {
        this.logger.warn(
          `Redis get failed, checking memory: ${describeError(err)}`,
        );
      }
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
    // A token can be in either store, so remove it from both
    this.memory.delete(key);
    if (this.redisReady) {
      try {
        await this.redis!.del(key);
      } catch (err) {
        this.logger.warn(`Redis del failed: ${describeError(err)}`);
      }
    }
  }

  onModuleDestroy() {
    this.redis?.disconnect();
  }
}

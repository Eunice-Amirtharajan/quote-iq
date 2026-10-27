import {
  BadRequestException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AppLogger } from '../../common/logger/logger.service';

export const IDEMPOTENCY_HEADER = 'idempotency-key';
const TTL_HOURS = 24;
const CLEANUP_EVERY_MS = 60 * 60 * 1000;
// Opaque client token (a UUID from the frontend): printable ASCII, no spaces, bounded length
const KEY_PATTERN = /^[\x21-\x7e]{8,255}$/;

export interface IdempotencyScope {
  userId: string;
  operation: string;
  key: string;
  requestHash: string;
}

/**
 * Idempotency keys for create mutations. A client sends the same
 * Idempotency-Key header on every retry of one logical request; the first request creates the
 * resource and records the key in the same transaction, later ones get the original resource
 * back. Keys are per user and per operation, and expire after 24 hours.
 */
@Injectable()
export class IdempotencyService {
  private lastCleanup = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {}

  /** Returns the key from a header value, or undefined when none was sent; rejects malformed keys. */
  parseKey(header: string | string[] | undefined): string | undefined {
    if (header === undefined || header === '') return undefined;
    const key = Array.isArray(header) ? header[0] : header;
    if (!KEY_PATTERN.test(key)) {
      throw new BadRequestException(
        'Idempotency-Key must be 8-255 printable characters with no spaces',
      );
    }
    return key;
  }

  /** Stable hash of the request input: same fields in any order give the same hash. */
  hashRequest(input: unknown): string {
    return createHash('sha256').update(stableStringify(input)).digest('hex');
  }

  /**
   * The resource id recorded for this key, or null if the key is new (or expired). Throws when
   * the key was used for a different request -- reusing a key that way is a client bug.
   */
  async findResource(scope: IdempotencyScope): Promise<string | null> {
    this.cleanupIfDue();
    const row = await this.prisma.idempotencyKey.findUnique({
      where: {
        userId_operation_key: {
          userId: scope.userId,
          operation: scope.operation,
          key: scope.key,
        },
      },
    });
    if (!row) return null;
    if (row.expiresAt <= new Date()) {
      // Expired: free the key so it can be recorded again
      await this.prisma.idempotencyKey.deleteMany({ where: { id: row.id } });
      return null;
    }
    if (row.requestHash !== scope.requestHash) {
      throw new UnprocessableEntityException(
        'This Idempotency-Key was already used for a different request',
      );
    }
    return row.resourceId;
  }

  /** Records the key with the caller's transaction client, so it commits with the resource. */
  async record(
    tx: Prisma.TransactionClient,
    scope: IdempotencyScope,
    resourceId: string,
  ): Promise<void> {
    await tx.idempotencyKey.create({
      data: {
        ...scope,
        resourceId,
        expiresAt: new Date(Date.now() + TTL_HOURS * 3600 * 1000),
      },
    });
  }

  private cleanupIfDue(): void {
    if (Date.now() - this.lastCleanup < CLEANUP_EVERY_MS) return;
    this.lastCleanup = Date.now();
    void this.prisma.idempotencyKey
      .deleteMany({ where: { expiresAt: { lt: new Date() } } })
      .then(({ count }) => {
        if (count > 0)
          this.logger.info(
            `Idempotency cleanup removed ${count} expired keys`,
            IdempotencyService.name,
          );
      })
      .catch((err: unknown) =>
        this.logger.warn(
          `Idempotency cleanup failed: ${err instanceof Error ? err.message : String(err)}`,
          IdempotencyService.name,
        ),
      );
  }
}

// JSON with object keys sorted at every level, so property order never changes the hash
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object')
    return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

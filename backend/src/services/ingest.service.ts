import { connection as redis, anomalyQueue } from '../queue';
import { ReadingsRepository, ReadingPayload } from '../repositories/readings.repository';
import { ScopedUser } from '../db';
import crypto from 'crypto';

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export class IngestService {
  private static readonly localIdempotency = new Map<string, string>();
  private static useLocalIdempotencyStore() {
    return process.env.NODE_ENV === 'test' || process.env.DISABLE_REDIS_IDEMPOTENCY === '1';
  }

  /**
   * Fast ingress layer ensuring Idempotent delivery.
   * Caches successful idempotency keys in Redis returning short-circuits on matched duplicates.
   */
  static async processBatch(idempotencyKey: string | undefined, readings: ReadingPayload[]): Promise<{ count: number, status: number }> {
    if (!Array.isArray(readings) || readings.length === 0) {
      throw { status: 400, message: 'Valid array of readings required' };
    }

    if (readings.length > 1000) {
      throw { status: 400, message: 'Max 1000 readings per request' };
    }

    // Process Idempotency Guarantee
    if (idempotencyKey) {
      const lockKey = `ingest_lock:${idempotencyKey}`;
      const bodyHash = crypto.createHash('sha256').update(stableStringify(readings)).digest('hex');
      const encoded = JSON.stringify({ bodyHash, createdAt: Date.now() });

      if (IngestService.useLocalIdempotencyStore()) {
        const cached = IngestService.localIdempotency.get(lockKey);
        if (cached) {
          const parsed = JSON.parse(cached) as { bodyHash?: string };
          if (parsed.bodyHash && parsed.bodyHash !== bodyHash) {
            throw { status: 409, message: 'Idempotency key already used with a different payload' };
          }
          return { count: readings.length, status: 200 };
        }
        IngestService.localIdempotency.set(lockKey, encoded);
      } else {
        const cached = await redis.get(lockKey);
        if (cached) {
          const parsed = JSON.parse(cached) as { bodyHash?: string };
          if (parsed.bodyHash && parsed.bodyHash !== bodyHash) {
            throw { status: 409, message: 'Idempotency key already used with a different payload' };
          }
          return { count: readings.length, status: 200 };
        }

        const created = await redis.set(lockKey, encoded, 'EX', 86400, 'NX');
        if (created !== 'OK') {
          const afterSet = await redis.get(lockKey);
          if (afterSet) {
            const parsed = JSON.parse(afterSet) as { bodyHash?: string };
            if (parsed.bodyHash && parsed.bodyHash !== bodyHash) {
              throw { status: 409, message: 'Idempotency key already used with a different payload' };
            }
            return { count: readings.length, status: 200 };
          }
        }
      }
    }

    // Push explicitly to durable DB storage directly via Repositories
    const insertedIds = await ReadingsRepository.bulkInsert(readings);

    if (process.env.DISABLE_QUEUES !== '1') {
      await anomalyQueue.add(
        'detect-batch',
        {
          readingIds: insertedIds,
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        }
      );
    }

    return { count: insertedIds.length, status: 202 };
  }

  static async getHistory(user: ScopedUser, sensorId: string, from: string, to: string, limit: number, offset: number) {
    if (!from || !to) {
      throw { status: 400, message: '?from= and ?to= are required ISO datetimes' };
    }
    return await ReadingsRepository.getHistory(user, sensorId, from, to, limit, offset);
  }
}

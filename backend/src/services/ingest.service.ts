import { connection as redis, anomalyQueue } from '../queue';
import { ReadingsRepository, ReadingPayload } from '../repositories/readings.repository';
import { ScopedUser } from '../db';

export class IngestService {
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
      // Set key preventing race-conditions. Expire after 24h.
      const isNewRequest = await redis.setnx(lockKey, 'LOCKING');
      if (!isNewRequest) {
         // It's a duplicate request. Do not write data but return success gracefully.
         return { count: readings.length, status: 200 };
      }
      await redis.expire(lockKey, 86400); // 24 hours
    }

    // Push explicitly to durable DB storage directly via Repositories
    const insertedIds = await ReadingsRepository.bulkInsert(readings);

    await anomalyQueue.add('detect-batch', {
      readingIds: insertedIds,
    }, {
      attempts: 3, 
      backoff: { type: 'exponential', delay: 2000 }
    });

    return { count: insertedIds.length, status: 202 };
  }

  static async getHistory(user: ScopedUser, sensorId: string, from: string, to: string, limit: number, offset: number) {
    if (!from || !to) {
      throw { status: 400, message: '?from= and ?to= are required ISO datetimes' };
    }
    return await ReadingsRepository.getHistory(user, sensorId, from, to, limit, offset);
  }
}

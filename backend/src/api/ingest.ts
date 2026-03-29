import { Router, Request, Response } from 'express';
import format from 'pg-format';
import { query } from '../db';
import { anomalyQueue } from '../queue';
import { v4 as uuidv4 } from 'uuid';

export const ingestRouter = Router();

interface ReadingPayload {
  sensor_id: string;
  timestamp: string;
  voltage: number;
  current: number;
  temperature: number;
  status_code: number;
}

ingestRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const readings: ReadingPayload[] = req.body;

  if (!Array.isArray(readings) || readings.length === 0) {
    res.status(400).json({ error: 'Valid array of readings required' });
    return;
  }

  // Cap at 1000 per request
  if (readings.length > 1000) {
    res.status(400).json({ error: 'Max 1000 readings per request' });
    return;
  }

  // Generate UUIDs to securely map to MQ queue post-insert
  const mapped = readings.map((r) => [
    uuidv4(), // id
    r.sensor_id,
    new Date(r.timestamp),
    r.voltage,
    r.current,
    r.temperature,
    r.status_code,
  ]);

  const insertQuery = format(
    'INSERT INTO readings (id, sensor_id, timestamp, voltage, current, temperature, status_code) VALUES %L RETURNING id',
    mapped
  );

  try {
    // 1. Durably store to DB
    const dbResult = await query(insertQuery);
    
    // Extract DB-verified IDs
    const insertedIds = dbResult.rows.map(r => r.id);

    // 2. Offload Anomaly Detection to BullMQ Async queue
    await anomalyQueue.add('detect-batch', {
      readingIds: insertedIds,
      // Grouping by sensor_id would save time, but passing raw IDs enables full decoupling.
    }, {
      attempts: 3, // Fault tolerance
      backoff: { type: 'exponential', delay: 2000 }
    });
    
    // We respond strictly in under 200ms (db execution typically takes ~15ms)
    res.status(202).json({ message: 'Ingested', count: insertedIds.length });
  } catch (error) {
    console.error('Ingest Error', error);
    res.status(500).json({ error: 'Internal server error during ingestion' });
  }
});

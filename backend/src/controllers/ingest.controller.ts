import { Router, Request, Response } from 'express';
import { IngestService } from '../services/ingest.service';
import { ReadingPayload } from '../repositories/readings.repository';

export const ingestRouter = Router();

ingestRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const readings: ReadingPayload[] = req.body;
  const idempotencyKey = req.header('Idempotency-Key');

  try {
    const { count, status } = await IngestService.processBatch(idempotencyKey, readings);
    res.status(status).json({ message: 'Ingested', count });
  } catch (err: any) {
    if (err.status) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error('Ingest Error', err);
    res.status(500).json({ error: 'Internal server error during ingestion' });
  }
});

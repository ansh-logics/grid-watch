import { Router, Request, Response } from 'express';
import { IngestService } from '../services/ingest.service';
import { ScopedUser } from '../db';

export const historyRouter = Router();

// /sensors/:id/history?from=&to=&limit=&offset=
historyRouter.get('/sensors/:id/history', async (req: Request, res: Response): Promise<void> => {
  const rawSensorId = req.params.id;
  const sensorId = typeof rawSensorId === 'string' ? rawSensorId : rawSensorId?.[0] ?? '';
  const from = req.query.from as string;
  const to = req.query.to as string;
  const limit = parseInt(req.query.limit as string) || 100;
  const offset = parseInt(req.query.offset as string) || 0;

  const user: ScopedUser = {
    id: req.header('x-user-id') || '00000000-0000-0000-0000-000000000000',
    role: (req.header('x-user-role') as 'operator' | 'supervisor') || 'operator',
    zone_id: req.header('x-user-zone') || undefined,
  };

  try {
    const historicalSeries = await IngestService.getHistory(user, sensorId, from, to, limit, offset);
    res.status(200).json({
      data: historicalSeries,
      pagination: { limit, offset, count: historicalSeries.length }
    });
  } catch (err: any) {
    if (err.status) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error('History Query Error:', err);
    res.status(500).json({ error: 'Internal system error mapping history constraints' });
  }
});

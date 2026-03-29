import { Router, Request, Response } from 'express';
import { scopedQuery, ScopedUser } from '../db';

export const historyRouter = Router();

// /sensors/:id/history?from=&to=&limit=&offset=
historyRouter.get('/sensors/:id/history', async (req: Request, res: Response): Promise<void> => {
  const sensorId = req.params.id;
  const from = req.query.from as string;
  const to = req.query.to as string;
  const limit = parseInt(req.query.limit as string) || 100;
  const offset = parseInt(req.query.offset as string) || 0;

  // Emulate auth middleware parsing (in absolute production this comes from JWT headers)
  const user: ScopedUser = {
    id: req.header('x-user-id') || '00000000-0000-0000-0000-000000000000',
    role: (req.header('x-user-role') as 'operator' | 'supervisor') || 'operator',
    zone_id: req.header('x-user-zone') || undefined,
  };

  if (!from || !to) {
     res.status(400).json({ error: '?from= and ?to= are required ISO datetimes' });
     return;
  }

  // The scopedQuery wrapper injects SET LOCAL request.zone_id so Postgres RLS isolates
  // exactly what data can be returned. If an operator tries to fetch a sensor ID
  // outside their zone, the RLS policy dynamically masks records (returning an empty array).
  
  const queryStr = `
    SELECT 
      r.id AS reading_id,
      r.timestamp,
      r.voltage,
      r.current,
      r.temperature,
      r.status_code,
      json_agg(
        json_build_object(
          'anomaly_id', an.id,
          'rule_type', ru.rule_type,
          'alert_id', al.id,
          'severity', al.severity,
          'status', al.status
        )
      ) FILTER (WHERE an.id IS NOT NULL) AS anomalies
    FROM readings r
    LEFT JOIN anomalies an ON an.reading_id = r.id
    LEFT JOIN rules ru ON an.rule_id = ru.id
    LEFT JOIN alerts al ON al.anomaly_id = an.id
    WHERE r.sensor_id = $1
      AND r.timestamp BETWEEN $2 AND $3
    GROUP BY r.id
    ORDER BY r.timestamp DESC
    LIMIT $4 OFFSET $5
  `;

  try {
    const dbResult = await scopedQuery(user, queryStr, [sensorId, from, to, limit, offset]);
    res.status(200).json({
      data: dbResult.rows,
      pagination: {
        limit, offset, count: dbResult.rows.length
      }
    });
  } catch (err) {
    console.error('History Query Error:', err);
    res.status(500).json({ error: 'Internal system error mapping history constraints' });
  }
});

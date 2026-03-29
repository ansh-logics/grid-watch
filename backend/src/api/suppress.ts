import { Router, Request, Response } from 'express';
import { scopedQuery, ScopedUser } from '../db';
import { v4 as uuidv4 } from 'uuid';

export const suppressRouter = Router();

// Create a planned maintenance window suppression per sensor
suppressRouter.post('/sensors/:id/suppress', async (req: Request, res: Response): Promise<void> => {
  const sensorId = req.params.id;
  const { startTime, endTime } = req.body;
  const user: ScopedUser = {
    id: req.header('x-user-id') || '00000000-0000-0000-0000-000000000000',
    role: (req.header('x-user-role') as 'operator' | 'supervisor') || 'operator',
    zone_id: req.header('x-user-zone'),
  };

  try {
    // Insert Suppression. RLS policies on sensors ensure that operators can only
    // ever suppress sensors that exist explicitly inside their zone_id constraint.
    const suppressionId = uuidv4();
    
    // Validate target sensor exists in scope:
    const sensorCheck = await scopedQuery(user, `SELECT id FROM sensors WHERE id = $1`, [sensorId]);
    if (sensorCheck.rowCount === 0) {
      res.status(404).json({ error: 'Sensor unavailable or access denied by RLS' });
      return;
    }

    await scopedQuery(user, `
      INSERT INTO suppressions (id, sensor_id, start_time, end_time, created_by) 
      VALUES ($1, $2, $3, $4, $5)
    `, [suppressionId, sensorId, startTime, endTime, user.id]);

    res.status(201).json({ message: 'Suppression window recorded successfully', id: suppressionId });
  } catch (err) {
    console.error('Failed creating suppression', err);
    res.status(500).json({ error: 'Failed to record suppression window' });
  }
});

import { Router, Request, Response } from 'express';
import { AlertService } from '../services/alert.service';
import { ScopedUser } from '../db';

export const alertsRouter = Router();

alertsRouter.put('/:id/status', async (req: Request, res: Response): Promise<void> => {
  const rawAlertId = req.params.id;
  const alertId = typeof rawAlertId === 'string' ? rawAlertId : rawAlertId?.[0] ?? '';
  const { status: newStatus } = req.body;
  const authUser = req.authUser;
  if (!authUser) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const user: ScopedUser = {
    id: authUser.id,
    role: authUser.role,
    zone_id: authUser.effectiveZoneId,
  };

  try {
    await AlertService.changeStatus(user, alertId, newStatus);
    res.status(200).json({ message: 'Transition successful' });
  } catch (err: any) {
    if (err.status) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error('Alert Status transition error:', err);
    res.status(500).json({ error: 'Failed to mutate alert' });
  }
});

export const suppressRouter = Router();

// Create a planned maintenance window suppression per sensor
suppressRouter.post('/sensors/:id/suppress', async (req: Request, res: Response): Promise<void> => {
  const rawSensorId = req.params.id;
  const sensorId = typeof rawSensorId === 'string' ? rawSensorId : rawSensorId?.[0] ?? '';
  const { startTime, endTime } = req.body;
  const authUser = req.authUser;
  if (!authUser) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const user: ScopedUser = {
    id: authUser.id,
    role: authUser.role,
    zone_id: authUser.effectiveZoneId,
  };

  try {
    const suppressionId = await AlertService.suppressSensor(user, sensorId, startTime, endTime);
    res.status(201).json({ message: 'Suppression window recorded successfully', id: suppressionId });
  } catch (err: any) {
    if (err.status) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error('Failed creating suppression', err);
    res.status(500).json({ error: 'Failed to record suppression window' });
  }
});

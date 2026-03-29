import { Request, Response, Router } from 'express';
import { ScopedUser } from '../db';
import { SensorService } from '../services/sensor.service';

export const sensorsRouter = Router();

sensorsRouter.get('/sensors', async (req: Request, res: Response): Promise<void> => {
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
  const zoneId = typeof req.query.zoneId === 'string' ? req.query.zoneId : undefined;

  try {
    const sensors = await SensorService.listSensors(user, zoneId);
    res.status(200).json(sensors);
  } catch (err: any) {
    if (err.status) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error('Sensors list query error', err);
    res.status(500).json({ error: 'Failed to fetch sensors' });
  }
});

sensorsRouter.get('/sensors/:id', async (req: Request, res: Response): Promise<void> => {
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
  const rawSensorId = req.params.id;
  const sensorId = typeof rawSensorId === 'string' ? rawSensorId : rawSensorId?.[0] ?? '';

  try {
    const detail = await SensorService.getSensorDetail(user, sensorId);
    res.status(200).json(detail);
  } catch (err: any) {
    if (err.status) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error('Sensor detail query error', err);
    res.status(500).json({ error: 'Failed to fetch sensor detail' });
  }
});

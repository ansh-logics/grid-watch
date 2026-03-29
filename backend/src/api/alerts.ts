import { Router, Request, Response } from 'express';
import { scopedQuery, ScopedUser } from '../db';
import { v4 as uuidv4 } from 'uuid';

export const alertsRouter = Router();

alertsRouter.put('/:id/status', async (req: Request, res: Response): Promise<void> => {
  const alertId = req.params.id;
  const { status: newStatus } = req.body;
  const user: ScopedUser = {
    id: req.header('x-user-id') || '00000000-0000-0000-0000-000000000000',
    role: (req.header('x-user-role') as 'operator' | 'supervisor') || 'operator',
    zone_id: req.header('x-user-zone'),
  };

  try {
    // 1. Fetch current alert guaranteeing zone isolated RLS scope via joined queries
    const currentAlertRes = await scopedQuery(user, 
      `SELECT a.status FROM alerts a WHERE id = $1`, [alertId]
    );
    if (currentAlertRes.rowCount === 0) {
       res.status(404).json({ error: 'Alert not found or inaccessible by Operator zone' });
       return;
    }
    
    const currentStatus = currentAlertRes.rows[0].status;

    // Transition Logic Restrictions
    // open -> acknowledged, acknowledged -> resolved, open -> resolved ONLY
    const validMap: Record<string, string[]> = {
      'open': ['acknowledged', 'resolved'],
      'acknowledged': ['resolved'],
      'resolved': [], // No backwards 
    };

    if (!validMap[currentStatus]?.includes(newStatus)) {
       res.status(400).json({ error: `Invalid transition from ${currentStatus} to ${newStatus}` });
       return;
    }

    // Single transaction for transitioning and creating audit log
    await scopedQuery(user, `
      DO $$
      BEGIN
        UPDATE alerts SET status = '${newStatus}', updated_at = NOW() WHERE id = '${alertId}';
        INSERT INTO alert_audit_log (id, alert_id, user_id, from_status, to_status, changed_at) 
        VALUES ('${uuidv4()}', '${alertId}', '${user.id}', '${currentStatus}', '${newStatus}', NOW());
      END $$;
    `);

    res.status(200).json({ message: 'Transition successful' });
  } catch (err) {
    console.error('Alert Status transition error:', err);
    res.status(500).json({ error: 'Failed to mutate alert' });
  }
});

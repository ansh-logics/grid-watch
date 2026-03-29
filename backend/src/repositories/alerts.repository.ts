import { scopedQuery, ScopedUser } from '../db';
import { v4 as uuidv4 } from 'uuid';

export class AlertsRepository {
  /**
   * Modifies an alert state utilizing specific User Context scoped isolation bounds.
   * Assumes explicit caller validation of correct transitions exists higher.
   */
  static async updateStatus(user: ScopedUser, alertId: string, currentStatus: string, newStatus: string): Promise<void> {
    await scopedQuery(user, `
      DO $$
      BEGIN
        UPDATE alerts SET status = '${newStatus}', updated_at = NOW() WHERE id = '${alertId}';
        INSERT INTO alert_audit_log (id, alert_id, user_id, from_status, to_status, changed_at) 
        VALUES ('${uuidv4()}', '${alertId}', '${user.id}', '${currentStatus}', '${newStatus}', NOW());
      END $$;
    `);
  }

  static async findAlertStatusScoped(user: ScopedUser, alertId: string): Promise<string | null> {
    const res = await scopedQuery(user, `SELECT a.status FROM alerts a WHERE id = $1`, [alertId]);
    return res.rowCount && res.rowCount > 0 ? res.rows[0].status : null;
  }
}

export class SuppressionsRepository {
  static async createSuppression(user: ScopedUser, sensorId: string, startTime: string, endTime: string): Promise<string> {
    const sensorCheck = await scopedQuery(user, `SELECT id FROM sensors WHERE id = $1`, [sensorId]);
    if (sensorCheck.rowCount === 0) {
      throw new Error('Sensor unavailable or access denied by RLS');
    }

    const suppressionId = uuidv4();
    await scopedQuery(user, `
      INSERT INTO suppressions (id, sensor_id, start_time, end_time, created_by) 
      VALUES ($1, $2, $3, $4, $5)
    `, [suppressionId, sensorId, startTime, endTime, user.id]);

    return suppressionId;
  }
}

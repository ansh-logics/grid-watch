import { scopedQuery, scopedTransaction, ScopedUser } from '../db';
import { v4 as uuidv4 } from 'uuid';

export class AlertsRepository {
  /**
   * Modifies an alert state utilizing specific User Context scoped isolation bounds.
   * Assumes explicit caller validation of correct transitions exists higher.
   */
  static async updateStatus(user: ScopedUser, alertId: string, currentStatus: string, newStatus: string): Promise<void> {
    await scopedTransaction(user, async (client) => {
      const auditId = uuidv4();
      const upd = await client.query(
        `UPDATE alerts SET status = $1::alert_status, updated_at = NOW() WHERE id = $2::uuid`,
        [newStatus, alertId]
      );
      if (!upd.rowCount) {
        throw { status: 404, message: 'Alert not found or inaccessible by zone' };
      }
      await client.query(
        `INSERT INTO alert_audit_log (id, alert_id, user_id, from_status, to_status, changed_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::alert_status, $5::alert_status, NOW())`,
        [auditId, alertId, user.id, currentStatus, newStatus]
      );
    });
  }

  static async findAlertStatusScoped(user: ScopedUser, alertId: string): Promise<string | null> {
    const res = await scopedQuery(user, `SELECT a.status FROM alerts a WHERE id = $1`, [alertId]);
    return res.rowCount && res.rowCount > 0 ? res.rows[0].status : null;
  }

  static async listScoped(
    user: ScopedUser,
    limit: number,
    offset: number,
    status?: string,
    severity?: string
  ) {
    const clauses: string[] = [];
    const params: Array<string | number> = [];

    if (status) {
      params.push(status);
      clauses.push(`a.status = $${params.length}::alert_status`);
    }
    if (severity) {
      params.push(severity);
      clauses.push(`a.severity = $${params.length}::alert_severity`);
    }

    params.push(limit);
    const limitIndex = params.length;
    params.push(offset);
    const offsetIndex = params.length;

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const result = await scopedQuery(
      user,
      `
      SELECT
        a.id::text AS id,
        an.sensor_id::text AS sensor_id,
        a.severity::text AS severity,
        a.status::text AS status,
        a.created_at AS timestamp
      FROM alerts a
      JOIN anomalies an ON an.id = a.anomaly_id
      ${where}
      ORDER BY a.created_at DESC
      LIMIT $${limitIndex} OFFSET $${offsetIndex}
      `,
      params
    );

    return result.rows;
  }
}

export class SuppressionsRepository {
  static async createSuppression(user: ScopedUser, sensorId: string, startTime: string, endTime: string): Promise<string> {
    const sensorCheck = await scopedQuery(user, `SELECT id FROM sensors WHERE id = $1`, [sensorId]);
    if (sensorCheck.rowCount === 0) {
      throw { status: 404, message: 'Sensor unavailable or access denied by RLS' };
    }

    const suppressionId = uuidv4();
    await scopedQuery(user, `
      INSERT INTO suppressions (id, sensor_id, start_time, end_time, created_by) 
      VALUES ($1, $2, $3, $4, $5)
    `, [suppressionId, sensorId, startTime, endTime, user.id]);

    return suppressionId;
  }
}

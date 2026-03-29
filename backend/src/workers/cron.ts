import { query } from '../db';
import { v4 as uuidv4 } from 'uuid';
import { SSEManager } from '../real-time/sse';

/**
 * Validates Rule C (Pattern Absence)
 * Every 60s, checking for silent sensors independently of Ingest pipeline
 */
export async function runAbsenceCron() {
  try {
    const absenceQuery = `
      SELECT s.id as sensor_id, s.zone_id, s.current_state, r.id as rule_id, r.severity 
      FROM sensors s
      JOIN rules r ON r.sensor_id = s.id AND r.rule_type = 'pattern_absence'
      WHERE s.last_reading_at < NOW() - INTERVAL '2 minutes' 
        AND s.current_state != 'silent'
    `;
    const { rows: silentSensors } = await query(absenceQuery);

    for (const sensor of silentSensors) {
      // Create Anomalies/Alerts
      const anomalyId = uuidv4();
      const alertId = uuidv4();
      
      const suppressionQuery = `SELECT 1 FROM suppressions WHERE sensor_id = $1 AND start_time <= NOW() AND end_time >= NOW()`;
      const isSuppressed = await query(suppressionQuery, [sensor.sensor_id]);
      const suppressed = isSuppressed.rowCount !== null && isSuppressed.rowCount > 0;

      await query(
        `INSERT INTO anomalies (id, sensor_id, rule_id, detected_at, is_suppressed) VALUES ($1, $2, $3, NOW(), $4)`,
        [anomalyId, sensor.sensor_id, sensor.rule_id, suppressed]
      );

      if (!suppressed) {
        await query(
          `INSERT INTO alerts (id, anomaly_id, severity, status) VALUES ($1, $2, $3, 'open')`,
          [alertId, anomalyId, sensor.severity]
        );
        
        await query(
          `UPDATE sensors SET current_state = 'silent' WHERE id = $1`, [sensor.sensor_id]
        );
        
        SSEManager.broadcastToZone(sensor.zone_id, {
          sensorId: sensor.sensor_id,
          newState: 'silent',
          alertId
        });
      }
    }
  } catch (err) {
    console.error('Absence Cron Error:', err);
  }
}

/**
 * Validates Auto Escalations
 * Every 60s, escalating unacknowledged critical alerts > 5 mins
 */
export async function runEscalationCron() {
  try {
    const escalationQuery = `
      SELECT a.id as alert_id
      FROM alerts a
      LEFT JOIN escalations e ON e.alert_id = a.id
      WHERE a.status = 'open' 
        AND a.severity = 'critical'
        AND a.created_at < NOW() - INTERVAL '5 minutes'
        AND e.id IS NULL -- Only escalate ONCE
    `;
    const { rows: openCriticalAlerts } = await query(escalationQuery);

    for (const alert of openCriticalAlerts) {
      // Find a supervisor (randomly or logically, for assessment we just get any supervisor ID)
      const supervisorQuery = `SELECT id FROM users WHERE role = 'supervisor' LIMIT 1`;
      const superRes = await query(supervisorQuery);
      if (superRes.rowCount === 0) continue;

      const supervisorId = superRes.rows[0].id;
      const escalationId = uuidv4();
      // Execute Escalation
      await query(
        `INSERT INTO escalations (id, alert_id, supervisor_id, escalated_at) VALUES ($1, $2, $3, NOW())`,
        [escalationId, alert.alert_id, supervisorId]
      );

      // We do not change the alert status automatically, it just gets flagged as escalated internally.
      // Frontends will see the escalation linkage.
    }
  } catch (err) {
      console.error('Escalation Cron Error:', err);
  }
}

// Boot up crons globally
export const bootCrons = () => {
  setInterval(runAbsenceCron, 60000);
  setInterval(runEscalationCron, 60000);
  console.log('Cron Workers booted: [Absence, Escalations]');
};

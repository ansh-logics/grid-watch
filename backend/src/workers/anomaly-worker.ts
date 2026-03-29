import { Worker, Job } from 'bullmq';
import { PoolClient } from 'pg';
import { connection } from '../queue';
import { withInternalTransaction } from '../db';
import { v4 as uuidv4 } from 'uuid';
import { SSEManager } from '../real-time/sse';

export const anomalyWorker = new Worker(
  'anomaly-detection',
  async (job: Job) => {
    const { readingIds } = job.data as { readingIds: string[] };

    try {
      await withInternalTransaction(async (client) => {
        // 1. Fetch exactly the batch we just inserted in POST /ingest
        const readingQuery = `
        SELECT r.*, s.current_state 
        FROM readings r 
        JOIN sensors s ON s.id = r.sensor_id
        WHERE r.id = ANY($1)
      `;
        const { rows: readings } = await client.query(readingQuery, [readingIds]);
        if (readings.length === 0) return;

        const sensorIds = [...new Set(readings.map((r) => r.sensor_id))];

        const rulesQuery = `SELECT * FROM rules WHERE sensor_id = ANY($1) AND rule_type IN ('threshold', 'rate_of_change')`;
        const { rows: allRules } = await client.query(rulesQuery, [sensorIds]);
        if (allRules.length === 0) return;

        for (const reading of readings) {
          const rulesForSensor = allRules.filter((r) => r.sensor_id === reading.sensor_id);

          for (const rule of rulesForSensor) {
            let triggered = false;

            if (rule.rule_type === 'threshold') {
              const config = rule.config as {
                min_temp: number;
                max_temp: number;
                max_voltage: number;
                min_voltage: number;
              };
              if (
                (config.max_voltage && reading.voltage > config.max_voltage) ||
                (config.min_voltage && reading.voltage < config.min_voltage) ||
                (config.max_temp && reading.temperature > config.max_temp) ||
                (config.min_temp && reading.temperature < config.min_temp)
              ) {
                triggered = true;
              }
            }

            if (rule.rule_type === 'rate_of_change') {
              const config = rule.config as { percentage: number; metric: 'voltage' | 'temperature' };
              const limit = config.percentage;
              const pastQuery = `
              SELECT ${config.metric} as val FROM readings 
              WHERE sensor_id = $1 AND timestamp < $2 
              ORDER BY timestamp DESC LIMIT 3
            `;
              const { rows: history } = await client.query(pastQuery, [reading.sensor_id, reading.timestamp]);
              if (history.length === 3) {
                const avg = history.reduce((sum, h) => sum + parseFloat(h.val), 0) / 3;
                const diff = Math.abs(reading[config.metric] - avg);
                if (avg !== 0 && (diff / avg) * 100 > limit) {
                  triggered = true;
                }
              }
            }

            if (triggered) {
              await applyTrigger(client, rule, reading);
            }
          }
        }
      });
    } catch (err) {
      console.error('Failed processing anomaly batch', err);
      throw err;
    }
  },
  { connection, concurrency: 50 }
);

async function applyTrigger(client: PoolClient, rule: any, reading: any) {
  const anomalyId = uuidv4();

  const isSuppressed = await client.query(
    `SELECT 1 FROM suppressions WHERE sensor_id = $1 AND start_time <= $2 AND end_time >= $2`,
    [reading.sensor_id, reading.timestamp]
  );
  const suppressed = isSuppressed.rowCount !== null && isSuppressed.rowCount > 0;

  await client.query(
    `INSERT INTO anomalies (id, sensor_id, rule_id, reading_id, detected_at, is_suppressed)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [anomalyId, reading.sensor_id, rule.id, reading.id, reading.timestamp, suppressed]
  );

  if (!suppressed) {
    const alertId = uuidv4();
    await client.query(`INSERT INTO alerts (id, anomaly_id, severity, status) VALUES ($1, $2, $3, 'open')`, [
      alertId,
      anomalyId,
      rule.severity,
    ]);

    const updated = await client.query(
      `UPDATE sensors SET current_state = $1, last_reading_at = $2 WHERE id = $3 RETURNING zone_id`,
      [rule.severity, reading.timestamp, reading.sensor_id]
    );

    if (updated.rowCount !== null && updated.rowCount > 0 && reading.current_state !== rule.severity) {
      const zone = updated.rows[0].zone_id;
      SSEManager.broadcastToZone(zone, {
        sensorId: reading.sensor_id,
        newState: rule.severity,
        alertId: alertId,
      });
    }
  }
}

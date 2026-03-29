import { ScopedUser, scopedQuery } from '../db';

export class SensorsRepository {
  static async listByZone(user: ScopedUser, zoneId?: string) {
    const zoneFilter = zoneId || user.zone_id;
    const params: string[] = [];
    let where = '';
    if (zoneFilter) {
      params.push(zoneFilter);
      where = `WHERE s.zone_id = $1::uuid`;
    }

    const result = await scopedQuery(
      user,
      `
      SELECT
        s.id::text AS sensor_id,
        s.zone_id::text AS zone_id,
        s.current_state::text AS state,
        s.last_reading_at
      FROM sensors s
      ${where}
      ORDER BY s.created_at DESC
      `,
      params
    );
    return result.rows;
  }

  static async getDetail(user: ScopedUser, sensorId: string) {
    const sensorResult = await scopedQuery(
      user,
      `
      SELECT
        s.id::text AS sensor_id,
        s.zone_id::text AS zone_id,
        s.current_state::text AS state,
        s.last_reading_at
      FROM sensors s
      WHERE s.id = $1::uuid
      `,
      [sensorId]
    );

    if (!sensorResult.rowCount) return null;
    const sensor = sensorResult.rows[0];

    const recentReadingsResult = await scopedQuery(
      user,
      `
      SELECT
        r.id::text AS id,
        r.sensor_id::text AS sensor_id,
        'telemetry'::text AS reading_type,
        r.voltage::float AS reading_value,
        EXISTS (
          SELECT 1 FROM anomalies an WHERE an.reading_id = r.id
        ) AS is_anomaly,
        (
          SELECT al.id::text
          FROM anomalies an2
          LEFT JOIN alerts al ON al.anomaly_id = an2.id
          WHERE an2.reading_id = r.id
          ORDER BY an2.detected_at DESC
          LIMIT 1
        ) AS linked_alert_id,
        r.timestamp
      FROM readings r
      WHERE r.sensor_id = $1::uuid
      ORDER BY r.timestamp DESC
      LIMIT 30
      `,
      [sensorId]
    );

    const anomaliesResult = await scopedQuery(
      user,
      `
      SELECT
        an.id::text AS id,
        an.sensor_id::text AS sensor_id,
        ru.rule_type::text AS reading_type,
        NULL::float AS reading_value,
        true AS is_anomaly,
        al.id::text AS linked_alert_id,
        an.detected_at AS timestamp
      FROM anomalies an
      LEFT JOIN rules ru ON ru.id = an.rule_id
      LEFT JOIN alerts al ON al.anomaly_id = an.id
      WHERE an.sensor_id = $1::uuid
      ORDER BY an.detected_at DESC
      LIMIT 20
      `,
      [sensorId]
    );

    const suppressionResult = await scopedQuery(
      user,
      `
      SELECT start_time, end_time
      FROM suppressions
      WHERE sensor_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [sensorId]
    );

    const latestSuppression = suppressionResult.rows[0] as
      | { start_time: string; end_time: string }
      | undefined;
    const now = Date.now();
    const startMs = latestSuppression ? new Date(latestSuppression.start_time).getTime() : 0;
    const endMs = latestSuppression ? new Date(latestSuppression.end_time).getTime() : 0;

    return {
      sensor,
      recentReadings: recentReadingsResult.rows,
      anomalies: anomaliesResult.rows,
      suppression: {
        active: Boolean(latestSuppression && now >= startMs && now <= endMs),
        startTime: latestSuppression?.start_time,
        endTime: latestSuppression?.end_time,
      },
    };
  }
}

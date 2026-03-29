import { internalQuery, scopedQuery, ScopedUser } from '../db';
import { v4 as uuidv4 } from 'uuid';

export interface ReadingPayload {
  sensor_id: string;
  timestamp: string;
  voltage: number;
  current: number;
  temperature: number;
  status_code: number;
}

export class ReadingsRepository {
  /**
   * Bulk inserts readings optimized for extreme high throughput using parameterized pg-format.
   * Takes the raw readings uniformly and returns the successfully inserted UUIDs.
   */
  static async bulkInsert(readings: ReadingPayload[]): Promise<string[]> {
    const ids = readings.map(() => uuidv4());
    const sensorIds = readings.map((r) => r.sensor_id);
    const timestamps = readings.map((r) => new Date(r.timestamp));
    const voltages = readings.map((r) => r.voltage);
    const currents = readings.map((r) => r.current);
    const temperatures = readings.map((r) => r.temperature);
    const statusCodes = readings.map((r) => r.status_code);

    const insertQuery = `
      INSERT INTO readings (id, sensor_id, timestamp, voltage, current, temperature, status_code)
      SELECT *
      FROM unnest(
        $1::uuid[],
        $2::uuid[],
        $3::timestamptz[],
        $4::numeric[],
        $5::numeric[],
        $6::numeric[],
        $7::int[]
      ) AS t(id, sensor_id, timestamp, voltage, current, temperature, status_code)
      RETURNING id
    `;

    const dbResult = await internalQuery(insertQuery, [
      ids,
      sensorIds,
      timestamps,
      voltages,
      currents,
      temperatures,
      statusCodes,
    ]);
    return dbResult.rows.map((r: any) => r.id);
  }

  /**
   * Retrieves readings strictly scoped by the executing user's row-level-security perimeter.
   */
  static async getHistory(user: ScopedUser, sensorId: string, from: string, to: string, limit: number, offset: number) {
    // Paginate reading ids first. The naive pattern (filter → join all rows → group → limit) scans the
    // entire time range per sensor; after heavy ingest that can be millions of rows per request.
    const queryStr = `
      WITH page AS (
        SELECT id
        FROM readings
        WHERE sensor_id = $1
          AND timestamp BETWEEN $2 AND $3
        ORDER BY timestamp DESC
        LIMIT $4 OFFSET $5
      )
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
      INNER JOIN page p ON p.id = r.id
      LEFT JOIN anomalies an ON an.reading_id = r.id
      LEFT JOIN rules ru ON an.rule_id = ru.id
      LEFT JOIN alerts al ON al.anomaly_id = an.id
      GROUP BY r.id
      ORDER BY r.timestamp DESC
    `;

    const dbResult = await scopedQuery(user, queryStr, [sensorId, from, to, limit, offset]);
    return dbResult.rows;
  }
}

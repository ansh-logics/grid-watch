import format from 'pg-format';
import { query, scopedQuery, ScopedUser } from '../db';
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
    const mapped = readings.map((r) => [
      uuidv4(),
      r.sensor_id,
      new Date(r.timestamp),
      r.voltage,
      r.current,
      r.temperature,
      r.status_code,
    ]);

    const insertQuery = format(
      `INSERT INTO readings (id, sensor_id, timestamp, voltage, current, temperature, status_code) 
       VALUES %L RETURNING id`,
      mapped
    );

    const dbResult = await query(insertQuery);
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

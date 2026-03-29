import { query } from '../../src/db';

export type SeededContext = {
  zoneId: string;
  operatorId: string;
  supervisorId: string;
  sensorId: string;
  ruleId: string;
};

export async function seedBaseContext(): Promise<SeededContext> {
  const zoneId = '11111111-1111-1111-1111-111111111111';
  const operatorId = '22222222-2222-2222-2222-222222222222';
  const supervisorId = '33333333-3333-3333-3333-333333333333';
  const sensorId = '44444444-4444-4444-4444-444444444444';
  const ruleId = '55555555-5555-5555-5555-555555555555';

  await query(`INSERT INTO zones (id, name) VALUES ($1::uuid, 'Zone A')`, [zoneId]);
  await query(
    `
    INSERT INTO users (id, name, email, role, zone_id)
    VALUES
      ($1::uuid, 'Operator A', 'operator@example.com', 'operator', $3::uuid),
      ($2::uuid, 'Supervisor A', 'supervisor@example.com', 'supervisor', NULL)
    `,
    [operatorId, supervisorId, zoneId]
  );
  await query(
    `INSERT INTO sensors (id, name, zone_id, current_state) VALUES ($1::uuid, 'Sensor A', $2::uuid, 'healthy')`,
    [sensorId, zoneId]
  );
  await query(
    `
    INSERT INTO rules (id, sensor_id, rule_type, config, severity)
    VALUES ($1::uuid, $2::uuid, 'threshold', '{"max_voltage":240}', 'warning')
    `,
    [ruleId, sensorId]
  );

  return { zoneId, operatorId, supervisorId, sensorId, ruleId };
}

export async function seedAlert(sensorId: string, ruleId: string) {
  const anomalyId = '66666666-6666-6666-6666-666666666666';
  const alertId = '77777777-7777-7777-7777-777777777777';
  const readingId = '88888888-8888-8888-8888-888888888888';

  await query(
    `
    INSERT INTO readings (id, sensor_id, timestamp, voltage, current, temperature, status_code)
    VALUES ($1::uuid, $2::uuid, NOW(), 230, 10, 30, 200)
    `,
    [readingId, sensorId]
  );
  await query(
    `
    INSERT INTO anomalies (id, sensor_id, rule_id, reading_id, detected_at, is_suppressed)
    VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, NOW(), false)
    `,
    [anomalyId, sensorId, ruleId, readingId]
  );
  await query(
    `INSERT INTO alerts (id, anomaly_id, severity, status) VALUES ($1::uuid, $2::uuid, 'warning', 'open')`,
    [alertId, anomalyId]
  );

  return { alertId, readingId, anomalyId };
}

-- Idempotent dev seed for existing databases (also mirrored at end of init.sql).
-- UUIDs align with backend/tests/integration/helpers.ts and frontend defaults.

INSERT INTO zones (id, name)
VALUES ('11111111-1111-1111-1111-111111111111', 'Zone A')
ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, name, email, role, zone_id)
VALUES
  (
    '22222222-2222-2222-2222-222222222222',
    'Operator A',
    'operator@example.com',
    'operator',
    '11111111-1111-1111-1111-111111111111'
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    'Supervisor A',
    'supervisor@example.com',
    'supervisor',
    NULL
  )
ON CONFLICT (email) DO NOTHING;

INSERT INTO sensors (id, name, zone_id, current_state)
VALUES (
  '44444444-4444-4444-4444-444444444444',
  'Sensor A',
  '11111111-1111-1111-1111-111111111111',
  'healthy'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO rules (id, sensor_id, rule_type, config, severity)
VALUES (
  '55555555-5555-5555-5555-555555555555',
  '44444444-4444-4444-4444-444444444444',
  'threshold',
  '{"max_voltage":240}'::jsonb,
  'warning'
)
ON CONFLICT (id) DO NOTHING;

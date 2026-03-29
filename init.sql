-- GridWatch Real-Time Infrastructure Database Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
CREATE TYPE sensor_state AS ENUM ('healthy', 'warning', 'critical', 'silent');
CREATE TYPE user_role AS ENUM ('operator', 'supervisor');
CREATE TYPE alert_severity AS ENUM ('warning', 'critical');
CREATE TYPE alert_status AS ENUM ('open', 'acknowledged', 'resolved');

-- 1. Zones
CREATE TABLE zones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Users Operators & Supervisors
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    role user_role NOT NULL,
    zone_id UUID REFERENCES zones(id), -- Nullable for supervisors
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Optional many-zone access for operators (supervisors can still access all zones)
CREATE TABLE user_zone_access (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    zone_id UUID NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, zone_id)
);
CREATE INDEX idx_user_zone_access_user ON user_zone_access(user_id);
CREATE INDEX idx_user_zone_access_zone ON user_zone_access(zone_id);

-- 3. Sensors
CREATE TABLE sensors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    zone_id UUID NOT NULL REFERENCES zones(id),
    current_state sensor_state DEFAULT 'healthy' NOT NULL,
    last_reading_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. Readings (High throughput)
CREATE TABLE readings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sensor_id UUID NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL,
    voltage NUMERIC(10, 4) NOT NULL,
    current NUMERIC(10, 4) NOT NULL,
    temperature NUMERIC(8, 2) NOT NULL,
    status_code INTEGER NOT NULL
);
-- Index for rapid retrieval and Rule B evaluations
CREATE INDEX idx_readings_sensor_time ON readings(sensor_id, timestamp DESC);
CREATE INDEX idx_readings_timestamp ON readings(timestamp DESC);

-- 5. Rules configuration
CREATE TABLE rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sensor_id UUID NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
    rule_type VARCHAR(50) NOT NULL, -- 'threshold', 'rate_of_change', 'pattern_absence'
    config JSONB NOT NULL, -- e.g. {"min_voltage": 10, "percentage": 15}
    severity alert_severity DEFAULT 'warning' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_rules_sensor ON rules(sensor_id);

-- 6. Anomalies
CREATE TABLE anomalies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sensor_id UUID NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
    rule_id UUID NOT NULL REFERENCES rules(id),
    reading_id UUID REFERENCES readings(id), -- Nullable if rule triggered by silence
    detected_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    is_suppressed BOOLEAN DEFAULT FALSE NOT NULL
);
CREATE INDEX idx_anomalies_sensor_detected ON anomalies(sensor_id, detected_at DESC);

-- 7. Alerts
CREATE TABLE alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    anomaly_id UUID UNIQUE NOT NULL REFERENCES anomalies(id) ON DELETE CASCADE,
    severity alert_severity NOT NULL,
    status alert_status DEFAULT 'open' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
-- Fast path for fetching open alerts and escalations
CREATE INDEX idx_alerts_status_severity ON alerts(status, severity);

-- 8. Alert Audit Log (Append Only)
CREATE TABLE alert_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alert_id UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id), -- System user if auto-escalation/system generated
    from_status alert_status,
    to_status alert_status NOT NULL,
    changed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_alert_audit_log_alert ON alert_audit_log(alert_id, changed_at DESC);

-- 9. Escalations Log
CREATE TABLE escalations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alert_id UUID UNIQUE NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    operator_id UUID REFERENCES users(id), -- The operator it was escalated FROM
    supervisor_id UUID REFERENCES users(id), -- The supervisor it was escalated TO
    escalated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 10. Suppressions
CREATE TABLE suppressions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sensor_id UUID NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_suppressions_sensor_time ON suppressions(sensor_id, start_time, end_time);

-- ---------------------------------------------------------------------------
-- Row-level security (session GUCs: request.role, request.zone_id, request.internal)
-- Application sets these via set_config(..., true) inside transactions.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app_is_internal () RETURNS boolean AS $$
  SELECT coalesce(current_setting('request.internal', true), '') = '1';
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_is_supervisor () RETURNS boolean AS $$
  SELECT coalesce(current_setting('request.role', true), '') = 'supervisor';
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_request_zone () RETURNS uuid AS $$
  SELECT (NULLIF(current_setting('request.zone_id', true), ''))::uuid;
$$ LANGUAGE sql STABLE;

ALTER TABLE zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE zones FORCE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE user_zone_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_zone_access FORCE ROW LEVEL SECURITY;
ALTER TABLE sensors ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensors FORCE ROW LEVEL SECURITY;
ALTER TABLE readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE readings FORCE ROW LEVEL SECURITY;
ALTER TABLE rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE rules FORCE ROW LEVEL SECURITY;
ALTER TABLE anomalies ENABLE ROW LEVEL SECURITY;
ALTER TABLE anomalies FORCE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts FORCE ROW LEVEL SECURITY;
ALTER TABLE alert_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_audit_log FORCE ROW LEVEL SECURITY;
ALTER TABLE escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalations FORCE ROW LEVEL SECURITY;
ALTER TABLE suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppressions FORCE ROW LEVEL SECURITY;

CREATE POLICY zones_isolation ON zones FOR ALL USING (
  app_is_internal()
  OR app_is_supervisor()
  OR id = app_request_zone()
) WITH CHECK (
  app_is_internal()
  OR app_is_supervisor()
  OR id = app_request_zone()
);

CREATE POLICY users_isolation ON users FOR ALL USING (
  app_is_internal()
  OR app_is_supervisor()
  OR zone_id IS NOT DISTINCT FROM app_request_zone()
) WITH CHECK (
  app_is_internal()
  OR app_is_supervisor()
  OR zone_id IS NOT DISTINCT FROM app_request_zone()
);

CREATE POLICY user_zone_access_isolation ON user_zone_access FOR ALL USING (
  app_is_internal()
  OR app_is_supervisor()
  OR EXISTS (
    SELECT 1
    FROM users u
    WHERE u.id = user_zone_access.user_id
      AND u.zone_id IS NOT DISTINCT FROM app_request_zone()
  )
) WITH CHECK (
  app_is_internal()
  OR app_is_supervisor()
);

CREATE POLICY sensors_isolation ON sensors FOR ALL USING (
  app_is_internal()
  OR app_is_supervisor()
  OR zone_id = app_request_zone()
) WITH CHECK (
  app_is_internal()
  OR app_is_supervisor()
  OR zone_id = app_request_zone()
);

CREATE POLICY readings_isolation ON readings FOR ALL USING (
  app_is_internal()
  OR app_is_supervisor()
  OR EXISTS (
    SELECT 1
    FROM sensors s
    WHERE s.id = readings.sensor_id
      AND s.zone_id = app_request_zone()
  )
) WITH CHECK (
  app_is_internal()
  OR app_is_supervisor()
  OR EXISTS (
    SELECT 1
    FROM sensors s
    WHERE s.id = readings.sensor_id
      AND s.zone_id = app_request_zone()
  )
);

CREATE POLICY rules_isolation ON rules FOR ALL USING (
  app_is_internal()
  OR app_is_supervisor()
  OR EXISTS (
    SELECT 1
    FROM sensors s
    WHERE s.id = rules.sensor_id
      AND s.zone_id = app_request_zone()
  )
) WITH CHECK (
  app_is_internal()
  OR app_is_supervisor()
  OR EXISTS (
    SELECT 1
    FROM sensors s
    WHERE s.id = rules.sensor_id
      AND s.zone_id = app_request_zone()
  )
);

CREATE POLICY anomalies_isolation ON anomalies FOR ALL USING (
  app_is_internal()
  OR app_is_supervisor()
  OR EXISTS (
    SELECT 1
    FROM sensors s
    WHERE s.id = anomalies.sensor_id
      AND s.zone_id = app_request_zone()
  )
) WITH CHECK (
  app_is_internal()
  OR app_is_supervisor()
  OR EXISTS (
    SELECT 1
    FROM sensors s
    WHERE s.id = anomalies.sensor_id
      AND s.zone_id = app_request_zone()
  )
);

CREATE POLICY alerts_isolation ON alerts FOR ALL USING (
  app_is_internal()
  OR app_is_supervisor()
  OR EXISTS (
    SELECT 1
    FROM anomalies an
    JOIN sensors s ON s.id = an.sensor_id
    WHERE an.id = alerts.anomaly_id
      AND s.zone_id = app_request_zone()
  )
) WITH CHECK (
  app_is_internal()
  OR app_is_supervisor()
  OR EXISTS (
    SELECT 1
    FROM anomalies an
    JOIN sensors s ON s.id = an.sensor_id
    WHERE an.id = anomaly_id
      AND s.zone_id = app_request_zone()
  )
);

CREATE POLICY alert_audit_log_isolation ON alert_audit_log FOR ALL USING (
  app_is_internal()
  OR app_is_supervisor()
  OR EXISTS (
    SELECT 1
    FROM alerts a
    JOIN anomalies an ON an.id = a.anomaly_id
    JOIN sensors s ON s.id = an.sensor_id
    WHERE a.id = alert_audit_log.alert_id
      AND s.zone_id = app_request_zone()
  )
) WITH CHECK (
  app_is_internal()
  OR app_is_supervisor()
  OR EXISTS (
    SELECT 1
    FROM alerts a
    JOIN anomalies an ON an.id = a.anomaly_id
    JOIN sensors s ON s.id = an.sensor_id
    WHERE a.id = alert_id
      AND s.zone_id = app_request_zone()
  )
);

CREATE POLICY escalations_isolation ON escalations FOR ALL USING (
  app_is_internal()
  OR app_is_supervisor()
  OR EXISTS (
    SELECT 1
    FROM alerts a
    JOIN anomalies an ON an.id = a.anomaly_id
    JOIN sensors s ON s.id = an.sensor_id
    WHERE a.id = escalations.alert_id
      AND s.zone_id = app_request_zone()
  )
) WITH CHECK (
  app_is_internal()
  OR app_is_supervisor()
);

CREATE POLICY suppressions_isolation ON suppressions FOR ALL USING (
  app_is_internal()
  OR app_is_supervisor()
  OR EXISTS (
    SELECT 1
    FROM sensors s
    WHERE s.id = suppressions.sensor_id
      AND s.zone_id = app_request_zone()
  )
) WITH CHECK (
  app_is_internal()
  OR app_is_supervisor()
  OR EXISTS (
    SELECT 1
    FROM sensors s
    WHERE s.id = sensor_id
      AND s.zone_id = app_request_zone()
  )
);

-- ---------------------------------------------------------------------------
-- Dev seed (fixed UUIDs; matches frontend defaults and integration test helpers)
-- ---------------------------------------------------------------------------
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

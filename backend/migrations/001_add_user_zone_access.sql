-- Adds explicit user-to-zone mapping support for auth and SSE authorization.
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS user_zone_access (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  zone_id UUID NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, zone_id)
);

CREATE INDEX IF NOT EXISTS idx_user_zone_access_user ON user_zone_access(user_id);
CREATE INDEX IF NOT EXISTS idx_user_zone_access_zone ON user_zone_access(zone_id);

ALTER TABLE user_zone_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_zone_access FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_zone_access_isolation ON user_zone_access;
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

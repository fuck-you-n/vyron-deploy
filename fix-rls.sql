-- Run this in Supabase SQL Editor

-- RLS fix
DROP POLICY IF EXISTS "Admins have full access" ON license_keys;
DROP POLICY IF EXISTS "Public can read license keys" ON license_keys;

CREATE POLICY "Public can read license keys" ON license_keys
  FOR SELECT USING (true);

CREATE POLICY "Admins have full access" ON license_keys
  FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- app_config table (safe to re-run)
CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read config" ON app_config;
DROP POLICY IF EXISTS "Admins can update config" ON app_config;

CREATE POLICY "Public can read config" ON app_config
  FOR SELECT USING (true);

CREATE POLICY "Admins can update config" ON app_config
  FOR ALL USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

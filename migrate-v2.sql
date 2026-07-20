-- ============================================================
-- Vyron v2 Migration — Roles, Plans, User Dashboard
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Add role column to license_keys
-- Roles: founder > admin > premium > free
DO $$ BEGIN
    ALTER TABLE license_keys ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'free';
    ALTER TABLE license_keys ADD CONSTRAINT license_keys_role_check CHECK (role IN ('founder', 'admin', 'premium', 'free'));
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 2. Update RLS policies
DROP POLICY IF EXISTS "Admins have full access" ON license_keys;
DROP POLICY IF EXISTS "Public can read license keys" ON license_keys;

-- Public read (for validation)
CREATE POLICY "Public can read license keys" ON license_keys
  FOR SELECT USING (true);

-- Admin + Founder can do everything
CREATE POLICY "Admins and Founders have full access" ON license_keys
  FOR ALL USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'founder')
  );

-- 3. app_config — download URLs per tier
CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read config" ON app_config;
DROP POLICY IF EXISTS "Admins can update config" ON app_config;

CREATE POLICY "Public can read config" ON app_config FOR SELECT USING (true);
CREATE POLICY "Admins can update config" ON app_config FOR ALL USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'founder')
);

-- 4. Insert default config values
INSERT INTO app_config (key, value) VALUES
  ('version', '1.0.0'),
  ('download_premium_url', ''),
  ('download_free_url', ''),
  ('changelog', '')
ON CONFLICT (key) DO NOTHING;

-- 5. Set your account as founder (replace email)
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"role": "founder"}'::jsonb
WHERE email = 'admin@vyron.com';

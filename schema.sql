-- ============================================================
-- Vyron Auth — Supabase SQL Schema
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- 1. Create the license_keys table
CREATE TABLE license_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_value TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'premium')),
  hwid TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id)
);

-- 2. Index for fast key lookups
CREATE INDEX idx_license_keys_key_value ON license_keys(key_value);

-- 3. Enable Row Level Security
ALTER TABLE license_keys ENABLE ROW LEVEL SECURITY;

-- 4. Public read policy — allows anyone to look up a key (for validation)
CREATE POLICY "Public can read license keys" ON license_keys
  FOR SELECT
  USING (true);

-- 5. Admin full access policy — only users with admin role in JWT
CREATE POLICY "Admins have full access" ON license_keys
  FOR ALL
  USING (
    auth.jwt() ->> 'role' = 'admin'
  );

-- 6. (Optional) Version config table — for the loader to check current version
CREATE TABLE app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Insert default version
INSERT INTO app_config (key, value) VALUES ('version', '1.0.0');

-- 8. RLS for app_config — public read, admin write
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read config" ON app_config
  FOR SELECT USING (true);

CREATE POLICY "Admins can update config" ON app_config
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

-- ============================================================
-- ADMIN USER SETUP
-- ============================================================
-- After creating your admin user via Supabase Dashboard > Authentication > Users:
--
-- Run this to grant admin role:
-- UPDATE auth.users
-- SET raw_app_meta_data = raw_app_meta_data || '{"role": "admin"}'::jsonb
-- WHERE email = 'admin@vyron.com';
-- ============================================================

-- Fix RLS policy — the old one checked wrong JWT path
-- Run this in Supabase SQL Editor

-- Drop the broken policies
DROP POLICY IF EXISTS "Admins have full access" ON license_keys;
DROP POLICY IF EXISTS "Public can read license keys" ON license_keys;

-- Public read (for key validation)
CREATE POLICY "Public can read license keys" ON license_keys
  FOR SELECT
  USING (true);

-- Admin full access — uses correct JWT path
CREATE POLICY "Admins have full access" ON license_keys
  FOR ALL
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- Same fix for app_config table
DROP POLICY IF EXISTS "Admins can update config" ON app_config;

CREATE POLICY "Admins can update config" ON app_config
  FOR ALL
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

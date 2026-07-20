-- ============================================================
-- VYRON — Full Supabase Schema
-- Run this ONE file in Supabase SQL Editor
-- Safe to re-run (uses IF NOT EXISTS / DROP IF EXISTS)
-- ============================================================

-- ===================== TABLES =====================

-- License keys
CREATE TABLE IF NOT EXISTS license_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_value TEXT NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    tier TEXT NOT NULL DEFAULT 'free',
    hwid TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id)
);

-- Add columns that may not exist on older tables
DO $$ BEGIN ALTER TABLE license_keys ADD COLUMN role TEXT NOT NULL DEFAULT 'free'; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE license_keys ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Add check constraint if not exists
DO $$ BEGIN
    ALTER TABLE license_keys ADD CONSTRAINT license_keys_role_check CHECK (role IN ('founder', 'admin', 'premium', 'free'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_license_keys_key_value ON license_keys(key_value);
CREATE INDEX IF NOT EXISTS idx_license_keys_user_id ON license_keys(user_id);

-- App config (version, download URLs, changelog)
CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User profiles (extends Supabase Auth)
CREATE TABLE IF NOT EXISTS user_profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'free' CHECK (role IN ('founder', 'admin', 'premium', 'free')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===================== RLS =====================

-- license_keys
ALTER TABLE license_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read for validation" ON license_keys;
DROP POLICY IF EXISTS "Admins and Founders full access" ON license_keys;
DROP POLICY IF EXISTS "Link key to own account" ON license_keys;
DROP POLICY IF EXISTS "Read own linked key" ON license_keys;
DROP POLICY IF EXISTS "Authenticated read for linking" ON license_keys;

-- Anyone can read keys (for API validation)
CREATE POLICY "Public read for validation"
    ON license_keys FOR SELECT USING (true);

-- Admin + Founder full access (via user_profiles role)
CREATE POLICY "Admins and Founders full access"
    ON license_keys FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.user_id = auth.uid()
            AND user_profiles.role IN ('admin', 'founder')
        )
    );

-- Authenticated users can link unlinked keys to their account
CREATE POLICY "Link key to own account"
    ON license_keys FOR UPDATE
    USING (
        auth.uid() IS NOT NULL
        AND (user_id IS NULL OR user_id = auth.uid())
    )
    WITH CHECK (user_id = auth.uid());

-- Users can read their own linked key
CREATE POLICY "Read own linked key"
    ON license_keys FOR SELECT
    USING (
        auth.uid() IS NOT NULL
        AND user_id = auth.uid()
    );

-- app_config
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read config" ON app_config;
DROP POLICY IF EXISTS "Admin write config" ON app_config;

CREATE POLICY "Public read config"
    ON app_config FOR SELECT USING (true);

CREATE POLICY "Admin write config"
    ON app_config FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.user_id = auth.uid()
            AND user_profiles.role IN ('admin', 'founder')
        )
    );

-- user_profiles
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own profile" ON user_profiles;
DROP POLICY IF EXISTS "Admins read all profiles" ON user_profiles;

CREATE POLICY "Users read own profile"
    ON user_profiles FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Admins read all profiles"
    ON user_profiles FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles up
            WHERE up.user_id = auth.uid()
            AND up.role IN ('admin', 'founder')
        )
    );

-- ===================== TRIGGERS =====================

-- Auto-create user_profile on signup + assign founder to admin email
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    uname TEXT;
    urole TEXT := 'free';
BEGIN
    uname := COALESCE(
        NEW.raw_user_meta_data->>'username',
        split_part(NEW.email, '@', 1)
    );

    IF NEW.email = 'admin@vyron.com' THEN
        urole := 'founder';
    END IF;

    INSERT INTO user_profiles (user_id, username, role)
    VALUES (NEW.id, uname, urole);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();

-- ===================== DEFAULT DATA =====================

INSERT INTO app_config (key, value) VALUES
    ('version', '1.0.0'),
    ('download_premium_url', ''),
    ('download_free_url', ''),
    ('changelog', '')
ON CONFLICT (key) DO NOTHING;

-- ===================== FOUNDER SETUP =====================

-- If admin@vyron.com already has an auth account, ensure founder role
UPDATE user_profiles
SET role = 'founder'
WHERE user_id IN (
    SELECT id FROM auth.users WHERE email = 'admin@vyron.com'
);

-- ============================================================
-- VYRON — Full Supabase Schema
-- Run this ONE file in Supabase SQL Editor
-- Safe to re-run (uses IF NOT EXISTS / DROP IF EXISTS)
-- ============================================================

-- Kill any old triggers first
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- ===================== TABLES =====================

-- License keys
CREATE TABLE IF NOT EXISTS license_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_value TEXT NOT NULL UNIQUE,
    key_hash TEXT,
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
DO $$ BEGIN ALTER TABLE license_keys ADD COLUMN key_hash TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Add check constraint if not exists
DO $$ BEGIN
    ALTER TABLE license_keys ADD CONSTRAINT license_keys_role_check CHECK (role IN ('founder', 'admin', 'premium', 'free'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_license_keys_key_value ON license_keys(key_value);
CREATE INDEX IF NOT EXISTS idx_license_keys_key_hash ON license_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_license_keys_user_id ON license_keys(user_id);

-- Migrate existing keys: populate key_hash from key_value
UPDATE license_keys SET key_hash = encode(sha256(key_value::bytea), 'hex') WHERE key_hash IS NULL;

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

-- Add hwid column to user_profiles if missing
DO $$ BEGIN ALTER TABLE user_profiles ADD COLUMN hwid TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE user_profiles ADD COLUMN last_online TIMESTAMPTZ; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Login attempts for rate limiting
CREATE TABLE IF NOT EXISTS login_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ip TEXT NOT NULL,
    endpoint TEXT NOT NULL DEFAULT 'login',
    success BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip, created_at DESC);

-- Auto-cleanup old login attempts (keep last 1 hour)
-- Run via pg_cron or as a scheduled function

-- ===================== RLS =====================

-- ===================== license_keys RLS =====================
ALTER TABLE license_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read for validation" ON license_keys;
DROP POLICY IF EXISTS "Admins and Founders full access" ON license_keys;
DROP POLICY IF EXISTS "Link key to own account" ON license_keys;
DROP POLICY IF EXISTS "Read own linked key" ON license_keys;
DROP POLICY IF EXISTS "Authenticated read for linking" ON license_keys;

-- Users can read their own linked key
CREATE POLICY "Read own linked key"
    ON license_keys FOR SELECT
    USING (
        auth.uid() IS NOT NULL
        AND user_id = auth.uid()
    );

-- Authenticated users can link unlinked keys to their account
CREATE POLICY "Link key to own account"
    ON license_keys FOR UPDATE
    USING (
        auth.uid() IS NOT NULL
        AND (user_id IS NULL OR user_id = auth.uid())
    )
    WITH CHECK (user_id = auth.uid());

-- Admin + Founder full access (checks user_profiles — no recursion since user_profiles is wide-open for reads)
CREATE POLICY "Admins and Founders full access"
    ON license_keys FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.user_id = auth.uid()
            AND user_profiles.role IN ('admin', 'founder')
        )
    );

-- ===================== app_config RLS =====================
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

-- ===================== user_profiles RLS =====================
-- Any authenticated user can read all profiles (usernames/roles are not secret)
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own profile" ON user_profiles;
DROP POLICY IF EXISTS "Admins read all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Users insert own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Authenticated read profiles" ON user_profiles;

CREATE POLICY "Authenticated read profiles"
    ON user_profiles FOR SELECT
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users insert own profile"
    ON user_profiles FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own profile"
    ON user_profiles FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ===================== login_attempts RLS =====================
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

-- Service role only (no client access)
-- No policies = no client access via anon key

-- ===================== TRIGGERS =====================

-- Profile creation handled by JavaScript on signup (more reliable)

-- ===================== DEFAULT DATA =====================

INSERT INTO app_config (key, value) VALUES
    ('version', '1.0.0'),
    ('download_premium_url', ''),
    ('download_free_url', ''),
    ('changelog', '')
ON CONFLICT (key) DO NOTHING;

-- ===================== LOGS =====================

CREATE TABLE IF NOT EXISTS logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event TEXT NOT NULL,
    detail TEXT,
    user_email TEXT,
    tier TEXT,
    hwid TEXT,
    ip TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins full access on logs" ON logs;
DROP POLICY IF EXISTS "Service role insert logs" ON logs;

CREATE POLICY "Admins full access on logs"
    ON logs FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.user_id = auth.uid()
            AND user_profiles.role IN ('admin', 'founder')
        )
    );

CREATE POLICY "Service role insert logs"
    ON logs FOR INSERT
    WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_event ON logs(event);

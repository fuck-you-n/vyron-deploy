-- ============================================================
-- VYRON — Assign Roles
-- Run this in Supabase SQL Editor AFTER schema.sql
-- ============================================================

-- Roles: founder > admin > premium > free

-- ============================================================
-- STEP 1: Run schema.sql first if you haven't already
-- ============================================================

-- ============================================================
-- STEP 2: Set YOUR account as founder
-- Run ALL 3 queries below in order:
-- ============================================================

-- Create your profile row if it doesn't exist, set role to founder
INSERT INTO user_profiles (user_id, username, role)
VALUES (
    '38432d83-f172-48a4-9d0c-27a15df04ae2',
    COALESCE(
        (SELECT raw_user_meta_data->>'username' FROM auth.users WHERE id = '38432d83-f172-48a4-9d0c-27a15df04ae2'),
        'admin'
    ),
    'founder'
)
ON CONFLICT (user_id) DO UPDATE SET role = 'founder';

-- Verify it worked (should show role = founder)
SELECT up.username, up.role, au.email
FROM user_profiles up
JOIN auth.users au ON au.id = up.user_id
WHERE up.user_id = '38432d83-f172-48a4-9d0c-27a15df04ae2';

-- ============================================================
-- HELPER: List all users and their roles
-- ============================================================
SELECT up.username, up.role, au.email, up.created_at
FROM user_profiles up
JOIN auth.users au ON au.id = up.user_id
ORDER BY up.created_at ASC;

-- ============================================================
-- HELPER: Assign roles by email (uncomment and change)
-- ============================================================
-- INSERT INTO user_profiles (user_id, username, role)
-- VALUES (
--     (SELECT id FROM auth.users WHERE email = 'user@email.com'),
--     'username',
--     'admin'
-- )
-- ON CONFLICT (user_id) DO UPDATE SET role = 'admin';

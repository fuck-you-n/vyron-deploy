-- ============================================================
-- VYRON — Assign Roles
-- Run this in Supabase SQL Editor
-- ============================================================

-- Roles: founder > admin > premium > free

-- List all users and their current roles
SELECT up.username, up.role, au.email
FROM user_profiles up
JOIN auth.users au ON au.id = up.user_id;

-- Assign role to a user (change the email and role below)
-- UPDATE user_profiles SET role = 'founder' WHERE user_id = (SELECT id FROM auth.users WHERE email = 'put-email-here');
-- UPDATE user_profiles SET role = 'admin' WHERE user_id = (SELECT id FROM auth.users WHERE email = 'put-email-here');
-- UPDATE user_profiles SET role = 'premium' WHERE user_id = (SELECT id FROM auth.users WHERE email = 'put-email-here');
-- UPDATE user_profiles SET role = 'free' WHERE user_id = (SELECT id FROM auth.users WHERE email = 'put-email-here');

-- Quick examples (uncomment and change email):
-- UPDATE user_profiles SET role = 'founder' WHERE user_id = (SELECT id FROM auth.users WHERE email = 'you@example.com');
-- UPDATE user_profiles SET role = 'admin' WHERE user_id = (SELECT id FROM auth.users WHERE email = 'admin@test.com');
-- UPDATE user_profiles SET role = 'premium' WHERE user_id = (SELECT id FROM auth.users WHERE email = 'user@test.com');

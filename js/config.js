// ============================================================
// CONFIG — Replace these with your Supabase project values
// ============================================================
const SUPABASE_URL = 'https://ktpydnabvffzybewsxgu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0cHlkbmFidmZmenliZXdzeGd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1NzM2NzcsImV4cCI6MjEwMDE0OTY3N30.hA6gpgsYDZATUinm4ogyODmGdt9lyDO66kUmTHwjsiM';

// ============================================================
// DO NOT put service_role key here — it stays server-side
// For admin operations, use Supabase Auth + RLS with admin role
// ============================================================

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

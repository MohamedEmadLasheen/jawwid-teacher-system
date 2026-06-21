-- ============================================================
-- Migration 004: Supervisor login accounts
--
-- Run this in: Supabase Dashboard → SQL Editor → Run
--
-- Lets a supervisor optionally have a real login account:
--   * adds a 'supervisor' role to profiles
--   * links a supervisor record to its auth user via user_id
--
-- Existing supervisors (user_id NULL) stay as records-only and are
-- unaffected. Safe to re-run.
-- ============================================================

-- 1. Allow the new 'supervisor' role on profiles.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('super_admin', 'admin', 'operation_admin', 'quality_admin', 'supervisor'));

-- 2. Link a supervisor record to its login account (nullable).
ALTER TABLE supervisors
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

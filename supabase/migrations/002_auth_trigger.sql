-- ============================================================
-- Migration 002: Auth Trigger — auto-create profile on signup
--
-- Run this in: Supabase Dashboard → SQL Editor → Run
--
-- This trigger fires whenever a new user is created via
-- supabase.auth.signUp(). It reads name, role, and permissions
-- from raw_user_meta_data (passed via the options.data argument
-- in the client SDK) and inserts the profile row server-side,
-- bypassing RLS. This removes the need for a client-side
-- profiles.insert() call — which fails when email confirmation
-- is enabled (no session = no auth token).
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER           -- runs as postgres, bypasses RLS
SET search_path = public
AS $$
DECLARE
  _permissions TEXT[] := '{}';
BEGIN
  -- Parse permissions JSON array from metadata if present
  IF (NEW.raw_user_meta_data ? 'permissions') THEN
    SELECT ARRAY(
      SELECT jsonb_array_elements_text(NEW.raw_user_meta_data->'permissions')
    ) INTO _permissions;
  END IF;

  INSERT INTO public.profiles (
    id,
    name,
    email,
    phone,
    position,
    department,
    role,
    permissions,
    locked_permissions,
    is_active
  ) VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.email, ''),
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'position',
    NEW.raw_user_meta_data->>'department',
    COALESCE(NEW.raw_user_meta_data->>'role', 'admin'),
    _permissions,
    '{}',
    true
  )
  ON CONFLICT (id) DO NOTHING;   -- idempotent: safe to re-run

  RETURN NEW;
END;
$$;

-- Drop and recreate so this script is safe to run multiple times
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

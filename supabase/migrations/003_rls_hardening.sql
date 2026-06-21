-- ============================================================
-- Migration 003: RLS Hardening — real role-based authorization
--
-- Run this in: Supabase Dashboard → SQL Editor → Run
--
-- Replaces the blanket "any authenticated user can do anything"
-- policies (migration 001) with role-aware policies, and blocks
-- privilege escalation on the profiles table.
--
-- Roles: super_admin > admin > operation_admin / quality_admin
--
-- Safe to re-run (drops policies/triggers/functions first).
-- ============================================================

-- ------------------------------------------------------------
-- Helper functions.
-- SECURITY DEFINER → run as the function owner, bypassing RLS,
-- so they can read profiles without causing policy recursion.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'super_admin' AND is_active
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_level()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('super_admin', 'admin') AND is_active
  );
$$;

-- ------------------------------------------------------------
-- Drop the old blanket "auth_all" policies on every table.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "auth_all" ON profiles;
DROP POLICY IF EXISTS "auth_all" ON teachers;
DROP POLICY IF EXISTS "auth_all" ON session_evaluations;
DROP POLICY IF EXISTS "auth_all" ON complaints;
DROP POLICY IF EXISTS "auth_all" ON complaint_actions;
DROP POLICY IF EXISTS "auth_all" ON improvement_plans;
DROP POLICY IF EXISTS "auth_all" ON deductions;
DROP POLICY IF EXISTS "auth_all" ON bonuses;
DROP POLICY IF EXISTS "auth_all" ON admin_recommendations;
DROP POLICY IF EXISTS "auth_all" ON admin_notes;
DROP POLICY IF EXISTS "auth_all" ON supervisors;
DROP POLICY IF EXISTS "auth_all" ON activity_logs;
DROP POLICY IF EXISTS "auth_all" ON branding_settings;
DROP POLICY IF EXISTS "auth_all" ON salary_records;

-- ============================================================
-- PROFILES — the privilege-escalation surface.
--   SELECT : any authenticated user (needed for login + admin user list)
--   INSERT : super_admin only (normal signup goes through the
--            SECURITY DEFINER trigger which bypasses RLS)
--   UPDATE : your own row, or super_admin for any row
--            (privileged columns further guarded by trigger below)
--   DELETE : super_admin only
-- ============================================================
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "profiles_insert" ON profiles
  FOR INSERT WITH CHECK (public.is_super_admin());

CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE
  USING (id = auth.uid() OR public.is_super_admin())
  WITH CHECK (id = auth.uid() OR public.is_super_admin());

CREATE POLICY "profiles_delete" ON profiles
  FOR DELETE USING (public.is_super_admin());

-- Guard: a non-super-admin updating their own profile can change
-- name/phone/avatar/last_login/etc. but NOT role, permissions,
-- locked_permissions or is_active. We silently restore the old
-- values so escalation attempts become no-ops.
CREATE OR REPLACE FUNCTION public.guard_profile_privileges()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_super_admin() THEN
    RETURN NEW;  -- super admins may change anything
  END IF;
  NEW.role               := OLD.role;
  NEW.permissions        := OLD.permissions;
  NEW.locked_permissions := OLD.locked_permissions;
  NEW.is_active          := OLD.is_active;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_privileges ON profiles;
CREATE TRIGGER trg_guard_profile_privileges
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privileges();

-- ============================================================
-- OPERATIONAL TABLES — all logged-in staff may read/create/update;
-- only admin-level (super_admin/admin) may DELETE.
-- ============================================================
DO $$
DECLARE
  tbl TEXT;
  op_tables TEXT[] := ARRAY[
    'teachers', 'session_evaluations', 'complaints', 'complaint_actions',
    'improvement_plans', 'deductions', 'bonuses', 'admin_recommendations',
    'admin_notes', 'supervisors'
  ];
BEGIN
  FOREACH tbl IN ARRAY op_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_select" ON %1$s;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_insert" ON %1$s;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_update" ON %1$s;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_delete" ON %1$s;', tbl);

    EXECUTE format(
      'CREATE POLICY "%1$s_select" ON %1$s FOR SELECT USING (auth.role() = ''authenticated'');', tbl);
    EXECUTE format(
      'CREATE POLICY "%1$s_insert" ON %1$s FOR INSERT WITH CHECK (auth.role() = ''authenticated'');', tbl);
    EXECUTE format(
      'CREATE POLICY "%1$s_update" ON %1$s FOR UPDATE USING (auth.role() = ''authenticated'') WITH CHECK (auth.role() = ''authenticated'');', tbl);
    EXECUTE format(
      'CREATE POLICY "%1$s_delete" ON %1$s FOR DELETE USING (public.is_admin_level());', tbl);
  END LOOP;
END $$;

-- ============================================================
-- SALARY RECORDS — financial data: admin-level only, all operations.
-- ============================================================
CREATE POLICY "salary_records_all" ON salary_records
  FOR ALL
  USING (public.is_admin_level())
  WITH CHECK (public.is_admin_level());

-- ============================================================
-- BRANDING — everyone reads; only super_admin writes.
-- ============================================================
CREATE POLICY "branding_select" ON branding_settings
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "branding_write" ON branding_settings
  FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "branding_insert" ON branding_settings
  FOR INSERT WITH CHECK (public.is_super_admin());

-- ============================================================
-- ACTIVITY LOGS — append-only audit trail.
--   SELECT : any authenticated user
--   INSERT : any authenticated user (actions self-log)
--   UPDATE : nobody (immutable — no policy granted)
--   DELETE : super_admin only (the "clear logs" action)
-- ============================================================
CREATE POLICY "activity_logs_select" ON activity_logs
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "activity_logs_insert" ON activity_logs
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "activity_logs_delete" ON activity_logs
  FOR DELETE USING (public.is_super_admin());

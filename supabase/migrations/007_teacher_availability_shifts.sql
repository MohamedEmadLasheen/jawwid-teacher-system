-- ============================================================
-- Migration 007: Scheduling Engine — Teacher Availability & Shift Model
--
-- Run this in: Supabase Dashboard → SQL Editor → Run
--
-- Phase 1 of the Scheduling Engine. Two teacher models:
--   * Hourly teachers manually set free-form available blocks
--     (teacher_availability).
--   * Shift teachers are assigned to reusable, academy-wide named
--     shift templates (shift_templates + teacher_shift_assignments) —
--     editing a template's hours once propagates to every assigned
--     teacher, avoiding per-teacher duplication.
-- Both converge into v_teacher_availability_unified, the single
-- view every later query (grid, conflict-check, Smart Assistant)
-- reads — the engine never has two parallel code paths for the
-- two teacher types.
--
-- Enables btree_gist (first migration needing EXCLUDE constraints).
--
-- Safe to re-run (CREATE TABLE IF NOT EXISTS, DROP POLICY IF EXISTS,
-- ADD COLUMN IF NOT EXISTS).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ------------------------------------------------------------
-- teachers ALTER — teacher type, branch, optional workload cap.
-- ------------------------------------------------------------
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS teacher_type TEXT NOT NULL DEFAULT 'hourly'
  CHECK (teacher_type IN ('hourly', 'shift'));
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS max_weekly_hours SMALLINT;

CREATE INDEX IF NOT EXISTS idx_teachers_teacher_type ON teachers (teacher_type);
CREATE INDEX IF NOT EXISTS idx_teachers_branch_id ON teachers (branch_id);

-- ------------------------------------------------------------
-- Hourly teachers — free-form weekly availability blocks.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS teacher_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_minute SMALLINT NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
  end_minute SMALLINT NOT NULL CHECK (end_minute BETWEEN 1 AND 1440),
  time_range int4range GENERATED ALWAYS AS (int4range(start_minute, end_minute)) STORED,
  timezone TEXT NOT NULL DEFAULT 'Asia/Dubai',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_minute > start_minute),
  EXCLUDE USING gist (teacher_id WITH =, day_of_week WITH =, time_range WITH &&) WHERE (is_active)
);

CREATE INDEX IF NOT EXISTS idx_teacher_availability_teacher_id ON teacher_availability (teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_availability_day_of_week ON teacher_availability (teacher_id, day_of_week);

-- ------------------------------------------------------------
-- Shift teachers — academy-wide reusable shift templates,
-- assigned to teachers per day. Editing a template once
-- (e.g. extending "Evening" by 30 min) propagates to every
-- assigned teacher — no per-teacher duplication.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shift_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES branches(id),
  name TEXT NOT NULL,
  start_minute SMALLINT NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
  end_minute SMALLINT NOT NULL CHECK (end_minute BETWEEN 1 AND 1440),
  time_range int4range GENERATED ALWAYS AS (int4range(start_minute, end_minute)) STORED,
  timezone TEXT NOT NULL DEFAULT 'Asia/Dubai',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_minute > start_minute),
  UNIQUE (branch_id, name)
);

CREATE TABLE IF NOT EXISTS teacher_shift_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  shift_template_id UUID NOT NULL REFERENCES shift_templates(id) ON DELETE RESTRICT,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (teacher_id, shift_template_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_teacher_shift_assignments_teacher_id ON teacher_shift_assignments (teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_shift_assignments_shift_template_id ON teacher_shift_assignments (shift_template_id);

-- ------------------------------------------------------------
-- Unified read-side view — the only thing downstream queries
-- (grid, conflict-check, Smart Assistant) ever read. Hourly and
-- shift teachers are different at data-entry time, identical at
-- query time.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW v_teacher_availability_unified AS
SELECT
  teacher_id,
  day_of_week,
  start_minute,
  end_minute,
  timezone,
  'hourly'::TEXT AS source
FROM teacher_availability
WHERE is_active
UNION ALL
SELECT
  tsa.teacher_id,
  tsa.day_of_week,
  st.start_minute,
  st.end_minute,
  st.timezone,
  'shift'::TEXT AS source
FROM teacher_shift_assignments tsa
JOIN shift_templates st ON st.id = tsa.shift_template_id
WHERE tsa.is_active AND st.is_active;

-- ------------------------------------------------------------
-- updated_at triggers (reuses the existing update_updated_at()
-- function defined in migration 001).
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_teacher_availability_updated_at ON teacher_availability;
CREATE TRIGGER trg_teacher_availability_updated_at
  BEFORE UPDATE ON teacher_availability FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_shift_templates_updated_at ON shift_templates;
CREATE TRIGGER trg_shift_templates_updated_at
  BEFORE UPDATE ON shift_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_teacher_shift_assignments_updated_at ON teacher_shift_assignments;
CREATE TRIGGER trg_teacher_shift_assignments_updated_at
  BEFORE UPDATE ON teacher_shift_assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ------------------------------------------------------------
-- RLS — same two-tier pattern as every other operational table.
-- teacher_availability stays as open as `teachers` itself (ops
-- staff edit it directly and often); shift_templates is
-- admin-level for writes since it's a shared, academy-wide
-- definition that shouldn't be casually edited by anyone.
-- ------------------------------------------------------------
ALTER TABLE teacher_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_shift_assignments ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl TEXT;
  op_tables TEXT[] := ARRAY['teacher_availability', 'teacher_shift_assignments'];
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

DROP POLICY IF EXISTS "shift_templates_select" ON shift_templates;
CREATE POLICY "shift_templates_select" ON shift_templates
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "shift_templates_insert" ON shift_templates;
CREATE POLICY "shift_templates_insert" ON shift_templates
  FOR INSERT WITH CHECK (public.is_admin_level());
DROP POLICY IF EXISTS "shift_templates_update" ON shift_templates;
CREATE POLICY "shift_templates_update" ON shift_templates
  FOR UPDATE USING (public.is_admin_level()) WITH CHECK (public.is_admin_level());
DROP POLICY IF EXISTS "shift_templates_delete" ON shift_templates;
CREATE POLICY "shift_templates_delete" ON shift_templates
  FOR DELETE USING (public.is_admin_level());

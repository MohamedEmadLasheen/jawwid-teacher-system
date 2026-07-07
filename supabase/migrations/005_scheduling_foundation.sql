-- ============================================================
-- Migration 005: Scheduling Engine — Foundational Domain
--
-- Run this in: Supabase Dashboard → SQL Editor → Run
--
-- Phase 0 of the Scheduling Engine. Introduces the domain that
-- doesn't exist yet anywhere in the app: Branches, Parents,
-- Students, Student↔Parent relationships, and Courses.
--
-- Every tenant-scopable table gets a nullable branch_id reserved
-- for future multi-branch support (single branch today; not yet
-- filtered on in RLS). Follows the same conventions as migration
-- 001: UUID PK via gen_random_uuid(), created_at/updated_at +
-- the shared update_updated_at() trigger, CHECK-constraint enums,
-- RLS via auth.role() = 'authenticated' for read/write and
-- public.is_admin_level() for delete.
--
-- Safe to re-run (CREATE TABLE IF NOT EXISTS, DROP POLICY IF EXISTS).
-- ============================================================

-- ------------------------------------------------------------
-- Branches — minimal, reserved for future multi-branch support.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Dubai',
  country TEXT DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO branches (name, timezone, country)
SELECT 'Jawwid Academy — Main', 'Asia/Dubai', ''
WHERE NOT EXISTS (SELECT 1 FROM branches);

-- ------------------------------------------------------------
-- Parents
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS parents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES branches(id),
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT DEFAULT '',
  country TEXT DEFAULT '',
  timezone TEXT NOT NULL DEFAULT 'Asia/Dubai',
  preferred_language TEXT NOT NULL DEFAULT 'ar' CHECK (preferred_language IN ('ar', 'en')),
  notes TEXT DEFAULT '',
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parents_full_name ON parents (full_name);
CREATE INDEX IF NOT EXISTS idx_parents_phone ON parents (phone);

-- ------------------------------------------------------------
-- Students
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES branches(id),
  full_name TEXT NOT NULL,
  date_of_birth DATE,
  country TEXT DEFAULT '',
  timezone TEXT NOT NULL DEFAULT 'Asia/Dubai',
  gender TEXT CHECK (gender IN ('male', 'female')),
  level TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'trial', 'withdrawn')),
  enrollment_source TEXT DEFAULT '',
  supervisor_id UUID REFERENCES supervisors(id),
  is_returning BOOLEAN NOT NULL DEFAULT false,
  notes TEXT DEFAULT '',
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_students_full_name ON students (full_name);
CREATE INDEX IF NOT EXISTS idx_students_status ON students (status);
CREATE INDEX IF NOT EXISTS idx_students_branch_id ON students (branch_id);
CREATE INDEX IF NOT EXISTS idx_students_supervisor_id ON students (supervisor_id);

-- ------------------------------------------------------------
-- Student ↔ Parent junction — supports multiple guardians per
-- student. Siblings are derived by querying students that share
-- a parent_id, not modeled as a separate table.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_parents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL DEFAULT 'guardian' CHECK (relationship IN ('mother', 'father', 'guardian', 'other')),
  is_primary_contact BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, parent_id)
);

CREATE INDEX IF NOT EXISTS idx_student_parents_student_id ON student_parents (student_id);
CREATE INDEX IF NOT EXISTS idx_student_parents_parent_id ON student_parents (parent_id);

-- ------------------------------------------------------------
-- Courses — category reuses the exact same vocabulary as
-- teachers.specializations (src/lib/types.ts Specialization),
-- so matching a course to a qualified teacher is a plain
-- equality join, not a separate mapping table.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES branches(id),
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'quran' CHECK (category IN (
    'quran', 'arabic_language', 'islamic_studies', 'tajweed',
    'noor_al_bayan', 'adults_quran', 'adults_arabic', 'english_language'
  )),
  default_duration_minutes SMALLINT NOT NULL DEFAULT 30 CHECK (default_duration_minutes > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_courses_category ON courses (category);

-- students.course_id references courses, which is only defined above this
-- point in the file — added as an ALTER rather than an inline column.
ALTER TABLE students ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES courses(id);
CREATE INDEX IF NOT EXISTS idx_students_course_id ON students (course_id);

-- ------------------------------------------------------------
-- updated_at triggers (reuses the existing update_updated_at()
-- function defined in migration 001).
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_branches_updated_at ON branches;
CREATE TRIGGER trg_branches_updated_at
  BEFORE UPDATE ON branches FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_parents_updated_at ON parents;
CREATE TRIGGER trg_parents_updated_at
  BEFORE UPDATE ON parents FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_students_updated_at ON students;
CREATE TRIGGER trg_students_updated_at
  BEFORE UPDATE ON students FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_courses_updated_at ON courses;
CREATE TRIGGER trg_courses_updated_at
  BEFORE UPDATE ON courses FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ------------------------------------------------------------
-- RLS — same two-tier pattern as every other operational table:
-- any authenticated user reads/creates/updates, admin-level only
-- deletes. None of this is financial-grade sensitive.
-- ------------------------------------------------------------
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

-- Branches: read-only for staff, super_admin manages branches.
DROP POLICY IF EXISTS "branches_select" ON branches;
CREATE POLICY "branches_select" ON branches
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "branches_insert" ON branches;
CREATE POLICY "branches_insert" ON branches
  FOR INSERT WITH CHECK (public.is_super_admin());
DROP POLICY IF EXISTS "branches_update" ON branches;
CREATE POLICY "branches_update" ON branches
  FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
DROP POLICY IF EXISTS "branches_delete" ON branches;
CREATE POLICY "branches_delete" ON branches
  FOR DELETE USING (public.is_super_admin());

DO $$
DECLARE
  tbl TEXT;
  op_tables TEXT[] := ARRAY['parents', 'students', 'student_parents', 'courses'];
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

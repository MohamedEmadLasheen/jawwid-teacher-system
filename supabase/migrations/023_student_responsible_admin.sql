-- ============================================================
-- Migration 023: Student → responsible Admin (Operations Supervisor)
--
-- Run this in: Supabase Dashboard → SQL Editor → Run
--
-- NO NEW ENTITY. The relationship this feature needs already exists
-- and is reused exactly as it stands:
--
--     students.supervisor_id  →  supervisors.id  →  supervisors.color_hex
--
--   * `students.supervisor_id` — created by migration 005, already
--     indexed (idx_students_supervisor_id) and already a real FK.
--   * `supervisors.color_hex` — created by migration 006, the single
--     source of truth for an Admin's colour. The student row never
--     stores a colour, so re-assigning a student re-colours them
--     everywhere by construction.
--
-- This migration therefore adds NO column and NO table. It only:
--
--   1. Documents the column's meaning (COMMENT), so the ownership
--      contract is readable from the schema itself.
--   2. Asserts the FK + index this feature depends on actually exist,
--      and creates the index if an older environment lacks it.
--   3. Aligns the four real Operations Supervisors with their
--      canonical colours — idempotently, by name, WITHOUT creating
--      duplicates and WITHOUT touching any other supervisor row
--      (Fatma/Quality and Hadeer/Operations from migration 001 are
--      never read or written here).
--   4. Reports the current ownership distribution as NOTICEs.
--
-- WHY supervisor_id STAYS NULLABLE
-- --------------------------------------------------------------
-- This is a live production system and legacy student rows may have
-- no Admin yet. A NOT NULL here would either fail the migration or
-- force an invented assignment, and inventing one is explicitly
-- forbidden: an unowned student must stay visibly unowned until a
-- human assigns them. The requirement is therefore enforced at the
-- application layer for NEW students (see
-- src/features/scheduling/utils/studentValidation.ts, which the
-- create/edit form runs before it submits), while legacy rows remain
-- a legitimate, filterable "Unassigned" state. Promoting the column
-- to NOT NULL is a separate, later migration to run only once
-- 023_verify.sql reports zero unassigned students.
--
-- NO STUDENT DML. Not one students row is inserted, updated or
-- deleted by this migration.
--
-- NO RLS CHANGE. students and supervisors keep the policies from
-- migrations 003/005 verbatim: any authenticated staff member may
-- SELECT/INSERT/UPDATE, only public.is_admin_level() may DELETE.
-- Ownership is an ordinary column on an already-protected table, so
-- it inherits that model and needs no new, broader policy.
--
-- THE BASANT → ASMAA RENAME
-- --------------------------------------------------------------
-- Migration 006 seeded the green Operations Supervisor as 'Basant';
-- the business now identifies that same person as 'Asmaa'. This is a
-- rename of one existing row, guarded so it can only ever fire when
-- it is unambiguous (a 'Basant' row exists AND no 'Asmaa' row does).
-- The row's id is preserved, so every student already assigned to it
-- keeps their Admin and their green. If the environment already has
-- 'Asmaa', the guard fails and nothing happens. No row is created or
-- dropped either way, so no duplicate Admin can appear.
--
-- Safe to re-run: every write is guarded by a current-state check.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Document the ownership contract on the column itself.
-- ------------------------------------------------------------
COMMENT ON COLUMN students.supervisor_id IS
  'Responsible Admin (Operations Supervisor) who owns this student. '
  'SOURCE OF TRUTH for the student''s colour everywhere in the scheduling '
  'UI: the colour is read from supervisors.color_hex through this FK and is '
  'never copied onto the student. NULL = legacy unassigned; required for new '
  'students at the application layer (studentValidation.ts).';

-- ------------------------------------------------------------
-- 2. The relationship this feature depends on, asserted.
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_students_supervisor_id ON students (supervisor_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'supervisor_id'
  ) THEN
    RAISE EXCEPTION 'students.supervisor_id is missing — run migration 005 first.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'supervisors' AND column_name = 'color_hex'
  ) THEN
    RAISE EXCEPTION 'supervisors.color_hex is missing — run migration 006 first.';
  END IF;

  -- The FK is what makes "assigned_admin_id references a real Admin"
  -- a database guarantee rather than an application convention.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class child  ON child.oid  = c.conrelid
    JOIN pg_class parent ON parent.oid = c.confrelid
    WHERE c.contype = 'f'
      AND child.relname  = 'students'
      AND parent.relname = 'supervisors'
  ) THEN
    RAISE EXCEPTION
      'students has no foreign key to supervisors — refusing to proceed, '
      'referential integrity of student ownership cannot be guaranteed.';
  END IF;
END $$;

-- ------------------------------------------------------------
-- 3. The four real Operations Supervisors, with canonical colours.
--
-- Keyed by name because name is how migration 006 seeded them and the
-- only stable handle a migration can use across environments; every
-- WRITE below is by id, so names never leak into application code.
-- ------------------------------------------------------------
DO $$
DECLARE
  -- Canonical colours — exactly the hexes already used by the live
  -- schedule (migration 006 / scripts/import-schedule/import_schedule.py).
  v_names  TEXT[] := ARRAY['Dina',    'Zainab',  'Rehab',   'Asmaa'];
  v_colors TEXT[] := ARRAY['#E06666', '#F9CB9C', '#C9DAF8', '#93C47D'];
  v_labels TEXT[] := ARRAY['red',     'orange',  'light blue', 'green'];
  v_i      INT;
  v_dupes  INT;
  v_id     UUID;
  v_color  TEXT;
  v_count  INT;
BEGIN
  -- 3a. Refuse to guess if a name is already ambiguous.
  SELECT count(*) INTO v_dupes
  FROM (
    SELECT name FROM supervisors
    WHERE name = ANY(v_names || ARRAY['Basant'])
    GROUP BY name HAVING count(*) > 1
  ) z;
  IF v_dupes > 0 THEN
    RAISE EXCEPTION
      'Duplicate supervisor names found (% name(s) appear more than once). '
      'Resolve the duplicates by hand first — this migration will not pick one.', v_dupes;
  END IF;

  -- 3b. Basant → Asmaa: a rename of ONE existing row, id preserved, so
  --     every student already assigned to it is unaffected.
  IF EXISTS (SELECT 1 FROM supervisors WHERE name = 'Basant')
     AND NOT EXISTS (SELECT 1 FROM supervisors WHERE name = 'Asmaa') THEN
    UPDATE supervisors SET name = 'Asmaa' WHERE name = 'Basant'
    RETURNING id INTO v_id;
    SELECT count(*) INTO v_count FROM students WHERE supervisor_id = v_id AND NOT is_deleted;
    RAISE NOTICE 'Renamed supervisor Basant -> Asmaa (id %), % assigned student(s) preserved.', v_id, v_count;
  END IF;

  -- 3c. Create any of the four that genuinely does not exist, and set
  --     the canonical colour on all four. Nothing else is touched.
  FOR v_i IN 1 .. array_length(v_names, 1) LOOP
    SELECT id, color_hex INTO v_id, v_color FROM supervisors WHERE name = v_names[v_i];

    IF v_id IS NULL THEN
      INSERT INTO supervisors (name, department, status, color_hex)
      VALUES (v_names[v_i], 'تشغيل', 'active', v_colors[v_i])
      RETURNING id INTO v_id;
      RAISE NOTICE 'Created missing Operations Supervisor % (%) -> %', v_names[v_i], v_labels[v_i], v_colors[v_i];
    ELSIF v_color IS DISTINCT FROM v_colors[v_i] THEN
      UPDATE supervisors SET color_hex = v_colors[v_i] WHERE id = v_id;
      RAISE NOTICE 'Set % colour % -> % (%)', v_names[v_i], coalesce(v_color, 'NULL'), v_colors[v_i], v_labels[v_i];
    END IF;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 4. Ownership distribution, for the record. Read-only.
-- ------------------------------------------------------------
DO $$
DECLARE
  r            RECORD;
  v_unassigned INT;
  v_orphans    INT;
BEGIN
  FOR r IN
    SELECT s.name, s.color_hex, count(st.id) AS students
    FROM supervisors s
    LEFT JOIN students st ON st.supervisor_id = s.id AND NOT st.is_deleted
    WHERE s.color_hex IS NOT NULL AND s.status = 'active'
    GROUP BY s.name, s.color_hex
    ORDER BY s.name
  LOOP
    RAISE NOTICE 'Admin % (%) owns % active student(s)', r.name, r.color_hex, r.students;
  END LOOP;

  SELECT count(*) INTO v_unassigned FROM students WHERE supervisor_id IS NULL AND NOT is_deleted;
  RAISE NOTICE '% legacy student(s) have no responsible Admin — left untouched on purpose.', v_unassigned;

  -- Should be impossible while the FK exists; reported rather than assumed.
  SELECT count(*) INTO v_orphans
  FROM students st
  WHERE st.supervisor_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM supervisors s WHERE s.id = st.supervisor_id);
  IF v_orphans > 0 THEN
    RAISE EXCEPTION '% student(s) point at a non-existent supervisor.', v_orphans;
  END IF;
END $$;

COMMIT;

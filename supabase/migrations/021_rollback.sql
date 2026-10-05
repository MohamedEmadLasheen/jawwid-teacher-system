-- ============================================================
-- ROLLBACK for migration 021_phase1_teacher_shift_windows.sql
--
-- Run this in: Supabase Dashboard → SQL Editor → Run
--
-- Reverses migration 021 exactly, returning the database to its
-- pre-migration state. Verified against the measured pre-migration
-- state (captured 2026-10-04, before 021 was applied):
--
--   shift_templates            0 rows
--   teacher_shift_assignments  0 rows
--   teacher_availability       0 rows
--   v_teacher_availability_unified  0 rows
--   all 76 active teachers had teacher_type = 'hourly'
--
-- Because nothing pre-existed, the reversal is exact: there is no
-- prior template or assignment that this could destroy, and the
-- teacher_type restore target is unambiguously 'hourly' for all 13.
--
-- Touches ONLY the 13 scoped teachers and the 2 templates 021
-- created. Never touches lessons, lesson_participants,
-- lesson_exceptions, students, or any unscoped teacher.
--
-- Safe to re-run (every statement is conditional).
--
-- NOTE: if `teacher_availability` or other shift templates have
-- been populated since 021 was applied, re-check before running —
-- the guard at the end will refuse rather than guess.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_ids UUID[] := ARRAY[
    -- SHIFT 14:00-19:00
    '51042bab-879f-469b-b738-ea4f35072e23',  -- Ashraf Elzohdy
    '1be38a96-e963-4fce-84a8-7fecd0857195',  -- Mohamed Hussein
    '31f8b40b-c0ab-4765-a444-df95585fbc54',  -- Arwa Ahmed
    'e814f138-9940-4f86-b78b-2e4e2908cfa9',  -- Menna Ramadan
    '3fd381c5-c34b-46cf-b28f-a55cf4634142',  -- Rokaya Ramadan
    'e93d453e-5282-4dc9-9e33-f3a77a0efd8a',  -- Hend Mohammed
    '14d7a6d9-749b-44a0-9a52-1a76611066cb',  -- Doaa Zakaria
    '686c57da-78d7-4a9d-abf4-b35c1b8e8faa',  -- Yasmeen Saad
    -- PART-TIME 14:00-18:00
    '0b9d761d-520d-46b5-9889-eb24225be3e8',  -- Aya Mustafa
    '291905ec-b1b5-4506-8b8e-3edb4e319357',  -- Zainab Hazem
    '703abfe6-3007-49d8-ac22-c68033f855bc',  -- Menna Ebrahim
    'cba57876-b992-4050-95f8-07972b1c8572',  -- Asmaa Magdy
    'c8c51712-35b1-4b09-ba3f-fbb9bca78405'   -- Yasmin Asaad
  ]::UUID[];

  v_template_ids UUID[];
  v_deleted_assignments INT;
  v_deleted_templates   INT;
  v_restored_types      INT;
  v_orphan_assignments  INT;
BEGIN
  SELECT COALESCE(array_agg(id), ARRAY[]::UUID[]) INTO v_template_ids
    FROM shift_templates
   WHERE branch_id IS NULL AND name IN ('Shift 14:00-19:00', 'Part-Time 14:00-18:00');

  IF array_length(v_template_ids, 1) IS NULL THEN
    RAISE NOTICE 'No 021 templates found — nothing to roll back.';
    RETURN;
  END IF;

  -- 1. Remove the assignments 021 created: only the scoped teachers,
  --    only against the two templates 021 owns.
  DELETE FROM teacher_shift_assignments
   WHERE teacher_id = ANY (v_ids)
     AND shift_template_id = ANY (v_template_ids);
  GET DIAGNOSTICS v_deleted_assignments = ROW_COUNT;

  -- 2. Refuse to drop a template that someone else has since started
  --    using — deleting it would silently remove their availability.
  SELECT count(*) INTO v_orphan_assignments
    FROM teacher_shift_assignments
   WHERE shift_template_id = ANY (v_template_ids);

  IF v_orphan_assignments > 0 THEN
    RAISE EXCEPTION
      'Refusing to delete the 021 templates: % assignment(s) from teachers outside the scoped 13 still reference them. Review those first.',
      v_orphan_assignments;
  END IF;

  DELETE FROM shift_templates WHERE id = ANY (v_template_ids);
  GET DIAGNOSTICS v_deleted_templates = ROW_COUNT;

  -- 3. Restore teacher_type. Pre-migration every one of these 13 was
  --    'hourly' (measured), so this is a restore, not a guess.
  UPDATE teachers SET teacher_type = 'hourly'
   WHERE id = ANY (v_ids) AND teacher_type IS DISTINCT FROM 'hourly';
  GET DIAGNOSTICS v_restored_types = ROW_COUNT;

  RAISE NOTICE 'Rollback: % assignment(s) deleted, % template(s) deleted, % teacher_type value(s) restored to ''hourly''.',
    v_deleted_assignments, v_deleted_templates, v_restored_types;
END $$;

COMMIT;

-- Verification: all three EXPECT 0.
SELECT (SELECT count(*) FROM shift_templates
         WHERE name IN ('Shift 14:00-19:00','Part-Time 14:00-18:00'))      AS templates_left,
       (SELECT count(*) FROM teacher_shift_assignments)                     AS assignments_left,
       (SELECT count(*) FROM teachers
         WHERE teacher_type = 'shift' AND NOT is_deleted)                   AS shift_type_teachers_left;

-- Lessons must be untouched by both 021 and this rollback.
-- EXPECT live_lessons = 1197, all_lessons = 1201, participants = 1482.
SELECT count(*) FILTER (WHERE lifecycle_status IN ('trial','active')) AS live_lessons,
       count(*)                                                       AS all_lessons,
       (SELECT count(*) FROM lesson_participants)                     AS participants
FROM lessons;

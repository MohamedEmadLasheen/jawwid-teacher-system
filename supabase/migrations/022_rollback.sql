-- ============================================================
-- ROLLBACK for 022_schedule_roster_and_working_windows.sql
--
-- Run this in: Supabase Dashboard → SQL Editor → Run
--
-- Restores the exact pre-022 state, measured 2026-10-05 before 022
-- was applied:
--
--   'Shift 14:00-19:00'      840-1140, 8 teachers
--   'Part-Time 14:00-18:00'  840-1080, 5 teachers (no Ghada)
--   roster 13 teachers, 91 active assignments
--   Ghada (9a8210de-…) teacher_type 'hourly', 0 assignments
--
-- Touches only the two templates and Ghada's assignments. Never
-- touches lessons, the other 13 teachers' membership, or the
-- excluded record Hend Mohammed (اعاجم).
--
-- Safe to re-run.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_ghada UUID := '9a8210de-a691-44bf-8b6e-c2f15380986a';
  v_full_tpl UUID;
  v_part_tpl UUID;
  v_removed INT := 0;
BEGIN
  SELECT id INTO v_full_tpl FROM shift_templates
   WHERE branch_id IS NULL AND name IN ('Full-time', 'Shift 14:00-19:00') ORDER BY name LIMIT 1;
  SELECT id INTO v_part_tpl FROM shift_templates
   WHERE branch_id IS NULL AND name IN ('Part-time', 'Part-Time 14:00-18:00') ORDER BY name LIMIT 1;

  IF v_full_tpl IS NULL OR v_part_tpl IS NULL THEN
    RAISE EXCEPTION 'Aborting: expected both templates to exist; nothing rolled back.';
  END IF;

  -- 1. Restore the full-time window and both original names.
  UPDATE shift_templates
     SET name = 'Shift 14:00-19:00', start_minute = 840, end_minute = 1140
   WHERE id = v_full_tpl;
  UPDATE shift_templates
     SET name = 'Part-Time 14:00-18:00', start_minute = 840, end_minute = 1080
   WHERE id = v_part_tpl;

  -- 2. Remove Ghada from the roster (delete the rows 022 created; she
  --    had none before, so this restores her exactly).
  DELETE FROM teacher_shift_assignments
   WHERE teacher_id = v_ghada AND shift_template_id IN (v_full_tpl, v_part_tpl);
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  UPDATE teachers SET teacher_type = 'hourly'
   WHERE id = v_ghada AND teacher_type IS DISTINCT FROM 'hourly';

  RAISE NOTICE 'Rollback: full-time window restored to 840-1140, names restored, % Ghada assignment(s) removed.', v_removed;
END $$;

COMMIT;

-- Verification — EXPECT: roster 13, assignments 91, windows 840-1140 / 840-1080,
-- Ghada hourly with 0 assignments, lesson counts unchanged (1197/1201/1482).
SELECT (SELECT count(DISTINCT teacher_id) FROM v_teacher_availability_unified)        AS roster,
       (SELECT count(*) FROM teacher_shift_assignments WHERE is_active)               AS active_assignments,
       (SELECT count(*) FROM teacher_shift_assignments
         WHERE teacher_id = '9a8210de-a691-44bf-8b6e-c2f15380986a')                   AS ghada_rows,
       (SELECT teacher_type FROM teachers
         WHERE id = '9a8210de-a691-44bf-8b6e-c2f15380986a')                           AS ghada_type,
       (SELECT count(*) FROM lessons WHERE lifecycle_status IN ('trial','active'))    AS lessons_live,
       (SELECT count(*) FROM lessons)                                                 AS lessons_all,
       (SELECT count(*) FROM lesson_participants)                                     AS participants;

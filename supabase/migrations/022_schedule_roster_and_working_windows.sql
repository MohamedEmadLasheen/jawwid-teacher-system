-- ============================================================
-- Migration 022: Schedule roster + working-window update
--
-- Run this in: Supabase Dashboard → SQL Editor → Run
--
-- Three changes, all on the availability model migration 007
-- established (shift_templates + teacher_shift_assignments →
-- v_teacher_availability_unified). No new tables, no schema change,
-- and NO lesson DML of any kind.
--
--   1. Full-time working window widens 14:00–19:00 → 12:00–19:00
--      (start_minute 840 → 720; end_minute stays 1140).
--   2. Ghada (id 9a8210de-…) joins the Part-time group, taking the
--      roster from 13 to 14 teachers.
--   3. The two templates are renamed to time-free, stable names
--      ('Full-time' / 'Part-time').
--
-- WHY THE RENAME: the Schedule UI groups its teacher roster by
-- template and labels each group with the template's name, showing the
-- window from start_minute/end_minute. A name like
-- 'Shift 14:00-19:00' becomes a lie the moment management moves a
-- boundary — which is an explicit requirement here. Time-free names
-- keep the label correct for any future window, and mean a boundary
-- change is a one-row UPDATE with no UI change at all.
--
-- SUPERSEDES: 021_rollback.sql looks the templates up by their old
-- names and will no-op after this migration. Use 022_rollback.sql
-- instead; it reverses this migration exactly.
--
-- TIMEZONE SAFETY: windows stay integer minutes-since-local-midnight,
-- never timestamps. 12:00 is literally 720. No UTC conversion exists
-- on this path, so the window cannot shift with timezone or DST.
--
-- DAYS: Ghada is assigned to exactly the days the Part-time template
-- is already configured for — read from the existing data rather than
-- hardcoded, so this migration makes no day-of-week policy change.
--
-- OUT OF SCOPE / UNTOUCHED: 'Hend Mohammed (اعاجم)'
-- (b9802a91-…) is a separate teacher record and is never read or
-- written here. Lessons, lesson_participants and lesson_exceptions
-- are never touched.
--
-- Safe to re-run: every write is an idempotent upsert guarded by a
-- current-state check.
-- ============================================================

BEGIN;

DO $$
DECLARE
  -- --------------------------------------------------------
  -- TARGET WINDOWS (minutes since local midnight)
  -- --------------------------------------------------------
  v_full_start  SMALLINT := 720;   -- 12:00
  v_full_end    SMALLINT := 1140;  -- 19:00
  v_part_start  SMALLINT := 840;   -- 14:00
  v_part_end    SMALLINT := 1080;  -- 18:00

  -- --------------------------------------------------------
  -- ROSTER — stable UUIDs with expected-name assertions.
  -- Order matches the approved business roster.
  -- --------------------------------------------------------
  v_full_ids UUID[] := ARRAY[
    '1be38a96-e963-4fce-84a8-7fecd0857195',  -- Mohamed Hussein
    '51042bab-879f-469b-b738-ea4f35072e23',  -- Ashraf Elzohdy
    '31f8b40b-c0ab-4765-a444-df95585fbc54',  -- Arwa Ahmed
    'e814f138-9940-4f86-b78b-2e4e2908cfa9',  -- Menna Ramadan
    '3fd381c5-c34b-46cf-b28f-a55cf4634142',  -- Rokaya Ramadan
    'e93d453e-5282-4dc9-9e33-f3a77a0efd8a',  -- Hend Mohammed  (NOT the (اعاجم) record)
    '14d7a6d9-749b-44a0-9a52-1a76611066cb',  -- Doaa Zakaria
    '686c57da-78d7-4a9d-abf4-b35c1b8e8faa'   -- Yasmeen Saad
  ]::UUID[];
  v_full_names TEXT[] := ARRAY[
    'Mohamed Hussein', 'Ashraf', 'Arwa Ahmed', 'Menna Ramadan',
    'Rokaya Ramadan', 'Hend Mohammed', 'Doaa Zakaria', 'Yasmeen Saad'
  ];

  v_part_ids UUID[] := ARRAY[
    '0b9d761d-520d-46b5-9889-eb24225be3e8',  -- Aya Mustafa
    '291905ec-b1b5-4506-8b8e-3edb4e319357',  -- Zainab Hazem
    '703abfe6-3007-49d8-ac22-c68033f855bc',  -- Menna Ebrahim
    '9a8210de-a691-44bf-8b6e-c2f15380986a',  -- Ghada  (stored without a surname)
    'cba57876-b992-4050-95f8-07972b1c8572',  -- Asmaa Magdy
    'c8c51712-35b1-4b09-ba3f-fbb9bca78405'   -- Yasmin Asaad
  ]::UUID[];
  v_part_names TEXT[] := ARRAY[
    'Aya Mustafa', 'Zainab Hazem', 'Menna Ebrahim', 'Ghada', 'Asmaa Magdy', 'Yasmin Asaad'
  ];

  -- The excluded duplicate — asserted untouched, never written.
  v_excluded_hend UUID := 'b9802a91-b3cc-444a-9150-5d7b3d431504';

  v_full_tpl   UUID;
  v_part_tpl   UUID;
  v_tpl        UUID;
  v_ids        UUID[];
  v_names      TEXT[];
  v_days       SMALLINT[];
  v_teacher    UUID;
  v_actual     TEXT;
  v_group      TEXT;
  v_day        SMALLINT;
  v_i          INT;
  v_problems   TEXT := '';
  v_rows       INT := 0;
  v_types      INT := 0;
BEGIN
  -- --------------------------------------------------------
  -- 1. Identity pre-flight. Collect every problem before aborting.
  -- --------------------------------------------------------
  FOR v_group, v_ids, v_names IN
    SELECT 'full', v_full_ids, v_full_names
    UNION ALL SELECT 'part', v_part_ids, v_part_names
  LOOP
    FOR v_i IN 1 .. array_length(v_ids, 1) LOOP
      SELECT full_name INTO v_actual FROM teachers WHERE id = v_ids[v_i] AND NOT is_deleted;
      IF v_actual IS NULL THEN
        v_problems := v_problems || format(E'\n  - %s (%s): no active teacher with this id', v_names[v_i], v_ids[v_i]);
      ELSIF btrim(v_actual) NOT LIKE v_names[v_i] || '%' THEN
        v_problems := v_problems || format(E'\n  - %s (%s): id now holds %L', v_names[v_i], v_ids[v_i], v_actual);
      END IF;
    END LOOP;
  END LOOP;

  -- The roster must be exactly 14 distinct teachers.
  IF (SELECT count(DISTINCT x) FROM unnest(v_full_ids || v_part_ids) AS x) <> 14 THEN
    v_problems := v_problems || E'\n  - roster is not 14 distinct teacher ids';
  END IF;

  -- The excluded duplicate must not have crept into the roster.
  IF v_excluded_hend = ANY (v_full_ids || v_part_ids) THEN
    v_problems := v_problems || E'\n  - excluded record Hend Mohammed (اعاجم) appears in the roster';
  END IF;

  IF v_problems <> '' THEN
    RAISE EXCEPTION E'Aborting, nothing written. Roster identity check failed:%', v_problems;
  END IF;

  -- --------------------------------------------------------
  -- 2. Templates — resolve by new name, falling back to the 021
  --    names, so this is idempotent whether or not it has run before.
  --
  --    NOTE: shift_templates has UNIQUE (branch_id, name) but these
  --    rows have branch_id IS NULL, and NULL never equals NULL in a
  --    unique index — ON CONFLICT would NOT dedupe them. Hence the
  --    explicit lookup.
  -- --------------------------------------------------------
  SELECT id INTO v_full_tpl FROM shift_templates
   WHERE branch_id IS NULL AND name IN ('Full-time', 'Shift 14:00-19:00') ORDER BY name LIMIT 1;
  IF v_full_tpl IS NULL THEN
    INSERT INTO shift_templates (branch_id, name, start_minute, end_minute, timezone, is_active)
    VALUES (NULL, 'Full-time', v_full_start, v_full_end, 'Asia/Dubai', true)
    RETURNING id INTO v_full_tpl;
    RAISE NOTICE 'Created template "Full-time" (% - %).', v_full_start, v_full_end;
  ELSE
    UPDATE shift_templates
       SET name = 'Full-time', start_minute = v_full_start, end_minute = v_full_end, is_active = true
     WHERE id = v_full_tpl
       AND (name, start_minute, end_minute, is_active)
           IS DISTINCT FROM ('Full-time', v_full_start, v_full_end, true);
    RAISE NOTICE 'Full-time template set to % - %.', v_full_start, v_full_end;
  END IF;

  SELECT id INTO v_part_tpl FROM shift_templates
   WHERE branch_id IS NULL AND name IN ('Part-time', 'Part-Time 14:00-18:00') ORDER BY name LIMIT 1;
  IF v_part_tpl IS NULL THEN
    INSERT INTO shift_templates (branch_id, name, start_minute, end_minute, timezone, is_active)
    VALUES (NULL, 'Part-time', v_part_start, v_part_end, 'Asia/Dubai', true)
    RETURNING id INTO v_part_tpl;
    RAISE NOTICE 'Created template "Part-time" (% - %).', v_part_start, v_part_end;
  ELSE
    UPDATE shift_templates
       SET name = 'Part-time', start_minute = v_part_start, end_minute = v_part_end, is_active = true
     WHERE id = v_part_tpl
       AND (name, start_minute, end_minute, is_active)
           IS DISTINCT FROM ('Part-time', v_part_start, v_part_end, true);
    RAISE NOTICE 'Part-time template set to % - %.', v_part_start, v_part_end;
  END IF;

  -- --------------------------------------------------------
  -- 3. Operational days — read from existing configuration rather
  --    than hardcoded, so this migration changes no day policy.
  --    Falls back to Sunday-Saturday only on a first-ever run.
  -- --------------------------------------------------------
  SELECT COALESCE(array_agg(DISTINCT day_of_week ORDER BY day_of_week), ARRAY[0,1,2,3,4,5,6]::SMALLINT[])
    INTO v_days
    FROM teacher_shift_assignments
   WHERE is_active AND shift_template_id IN (v_full_tpl, v_part_tpl);

  RAISE NOTICE 'Operational days preserved: %', v_days;

  -- --------------------------------------------------------
  -- 4. Assignments — one row per teacher per configured day.
  -- --------------------------------------------------------
  FOR v_group, v_ids, v_tpl IN
    SELECT 'full', v_full_ids, v_full_tpl
    UNION ALL SELECT 'part', v_part_ids, v_part_tpl
  LOOP
    FOREACH v_teacher IN ARRAY v_ids LOOP
      -- Fixed-shift teachers belong to the 'shift' teacher model. This
      -- only drives which availability editor the Teacher Profile shows.
      UPDATE teachers SET teacher_type = 'shift'
       WHERE id = v_teacher AND teacher_type IS DISTINCT FROM 'shift';
      IF FOUND THEN v_types := v_types + 1; END IF;

      FOREACH v_day IN ARRAY v_days LOOP
        INSERT INTO teacher_shift_assignments (teacher_id, shift_template_id, day_of_week, is_active)
        VALUES (v_teacher, v_tpl, v_day, true)
        ON CONFLICT (teacher_id, shift_template_id, day_of_week)
          DO UPDATE SET is_active = true;
        v_rows := v_rows + 1;

        -- A teacher must belong to exactly one group per day; deactivate
        -- (never delete) any assignment to the other template.
        UPDATE teacher_shift_assignments SET is_active = false
         WHERE teacher_id = v_teacher AND day_of_week = v_day
           AND shift_template_id <> v_tpl AND is_active;
      END LOOP;
    END LOOP;
  END LOOP;

  -- --------------------------------------------------------
  -- 5. Post-conditions — fail the whole transaction if the resulting
  --    state is not exactly what was intended.
  -- --------------------------------------------------------
  IF (SELECT count(DISTINCT teacher_id) FROM v_teacher_availability_unified) <> 14 THEN
    RAISE EXCEPTION 'Post-check failed: roster is % teachers, expected 14.',
      (SELECT count(DISTINCT teacher_id) FROM v_teacher_availability_unified);
  END IF;

  IF EXISTS (SELECT 1 FROM teacher_shift_assignments a
              WHERE a.is_active AND a.teacher_id = v_excluded_hend) THEN
    RAISE EXCEPTION 'Post-check failed: excluded record Hend Mohammed (اعاجم) has an active assignment.';
  END IF;

  IF EXISTS (SELECT 1 FROM v_teacher_availability_unified
              GROUP BY teacher_id, day_of_week HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Post-check failed: a teacher has more than one window on some day.';
  END IF;

  RAISE NOTICE 'Done: 14 teachers, % day-assignments ensured, % teacher_type value(s) set to ''shift''.',
    v_rows, v_types;
END $$;

COMMIT;

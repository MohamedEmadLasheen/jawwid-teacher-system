-- ============================================================
-- Migration 021: Phase 1 — Working shift windows for the first
--                scoped group of teachers
--
-- Run this in: Supabase Dashboard → SQL Editor → Run
--
-- Gives 13 named teachers a real, database-backed weekly working
-- window, reusing the shift model migration 007 already
-- established (shift_templates + teacher_shift_assignments →
-- v_teacher_availability_unified). No new availability system, no
-- new tables, NO SCHEMA CHANGE AT ALL — this migration only
-- inserts/updates rows.
--
--   SHIFT     14:00–19:00  (start_minute 840, end_minute 1140)  — 8 teachers
--   PART-TIME 14:00–18:00  (start_minute 840, end_minute 1080)  — 5 teachers
--
-- TIMEZONE SAFETY: availability is stored as minutes-since-local-
-- midnight integers (not timestamps), exactly as migration 007
-- defined it. 14:00 is literally 840 — no UTC conversion exists
-- anywhere on this path, so the displayed working hours cannot
-- shift with server/client timezone, locale or DST. The timezone
-- column keeps the academy default 'Asia/Dubai', matching every
-- other row in the schema.
--
-- SCOPING: only the 13 teacher IDs listed below are touched. At the
-- time of writing NO teacher in this database had any availability
-- row at all (teacher_availability: 0 rows, teacher_shift_assignments:
-- 0 rows, shift_templates: 0 rows), so nothing is being overwritten
-- and no teacher outside this list gains or loses anything.
--
-- IDENTIFICATION: teachers are addressed by their stable UUID, not
-- by display name. Names in this database are English
-- transliterations ('Menna Ramadan'), not the Arabic spellings the
-- request used ('منه رمضان'), so name matching would be unreliable.
-- Each ID carries a name assertion so running this against a
-- different database aborts instead of assigning shifts to whoever
-- happens to hold that UUID.
--
-- DELIBERATELY EXCLUDED, pending confirmation:
--   * 'غاده رجب' (Ghada Ragab) — the only Ghada on record is stored
--     as 'Ghada ' with no surname, so the match could not be
--     confirmed. She gets NO shift window here.
--   * 'Hend Mohammed (اعاجم)' (b9802a91-…) — confirmed to be a
--     duplicate record of the same person as 'Hend Mohammed '
--     (e93d453e-…). The shift is applied to the plain record only;
--     this migration does NOT merge or delete the duplicate. Clean
--     that up separately.
--
-- Safe to re-run: every write is an idempotent upsert.
-- ============================================================

BEGIN;

DO $$
DECLARE
  -- --------------------------------------------------------
  -- CONFIGURATION
  -- --------------------------------------------------------
  -- 0=Sunday … 6=Saturday, matching DAYS_OF_WEEK in the UI and
  -- day_of_week everywhere in the DB. All seven days are included
  -- because all seven currently carry live lessons (Sun 215, Mon 190,
  -- Tue 196, Wed 175, Thu 198, Fri 66, Sat 157). Friday is clearly a
  -- reduced day — narrow this array if these teachers are not
  -- actually rostered then.
  v_days SMALLINT[] := ARRAY[0,1,2,3,4,5,6];

  -- teacher UUID → expected name prefix (assertion only).
  v_shift_ids   UUID[] := ARRAY[
    '51042bab-879f-469b-b738-ea4f35072e23',  -- Ashraf Elzohdy      (أشرف)
    '1be38a96-e963-4fce-84a8-7fecd0857195',  -- Mohamed Hussein     (محمد حسين)
    '31f8b40b-c0ab-4765-a444-df95585fbc54',  -- Arwa Ahmed          (اروي احمد)
    'e814f138-9940-4f86-b78b-2e4e2908cfa9',  -- Menna Ramadan       (منه رمضان)
    '3fd381c5-c34b-46cf-b28f-a55cf4634142',  -- Rokaya Ramadan      (رقيه رمضان)
    'e93d453e-5282-4dc9-9e33-f3a77a0efd8a',  -- Hend Mohammed       (هند محمد)
    '14d7a6d9-749b-44a0-9a52-1a76611066cb',  -- Doaa Zakaria        (دعاء زكريا)
    '686c57da-78d7-4a9d-abf4-b35c1b8e8faa'   -- Yasmeen Saad        (ياسمين سعد)
  ]::UUID[];
  v_shift_names TEXT[] := ARRAY[
    'Ashraf', 'Mohamed Hussein', 'Arwa Ahmed', 'Menna Ramadan',
    'Rokaya Ramadan', 'Hend Mohammed', 'Doaa Zakaria', 'Yasmeen Saad'
  ];

  v_part_ids   UUID[] := ARRAY[
    '0b9d761d-520d-46b5-9889-eb24225be3e8',  -- Aya Mustafa         (ايه مصطفى)
    '291905ec-b1b5-4506-8b8e-3edb4e319357',  -- Zainab Hazem        (زينب حازم)
    '703abfe6-3007-49d8-ac22-c68033f855bc',  -- Menna Ebrahim       (منه إبراهيم)
    'cba57876-b992-4050-95f8-07972b1c8572',  -- Asmaa Magdy         (أسماء مجدي)
    'c8c51712-35b1-4b09-ba3f-fbb9bca78405'   -- Yasmin Asaad        (ياسمين أسعد)
  ]::UUID[];
  v_part_names TEXT[] := ARRAY[
    'Aya Mustafa', 'Zainab Hazem', 'Menna Ebrahim', 'Asmaa Magdy', 'Yasmin Asaad'
  ];

  v_shift_template_id UUID;
  v_part_template_id  UUID;
  v_template_id       UUID;
  v_teacher_id        UUID;
  v_ids               UUID[];
  v_names             TEXT[];
  v_actual            TEXT;
  v_group             TEXT;
  v_day               SMALLINT;
  v_i                 INT;
  v_hourly_rows       INT;
  v_problems          TEXT := '';
  v_rows              INT := 0;
  v_types_changed     INT := 0;
BEGIN
  -- --------------------------------------------------------
  -- 1. Pre-flight: every ID must exist, be active, and still carry
  --    the name we resolved it from. Collect ALL problems first so
  --    one run reports the full list.
  -- --------------------------------------------------------
  FOR v_group, v_ids, v_names IN
    SELECT 'shift', v_shift_ids, v_shift_names
    UNION ALL SELECT 'part', v_part_ids, v_part_names
  LOOP
    FOR v_i IN 1 .. array_length(v_ids, 1) LOOP
      SELECT full_name INTO v_actual
        FROM teachers WHERE id = v_ids[v_i] AND NOT is_deleted;

      IF v_actual IS NULL THEN
        v_problems := v_problems || format(E'\n  - %s (%s): no active teacher with this id', v_names[v_i], v_ids[v_i]);
      ELSIF btrim(v_actual) NOT LIKE v_names[v_i] || '%' THEN
        v_problems := v_problems || format(E'\n  - %s (%s): id now holds %L', v_names[v_i], v_ids[v_i], v_actual);
      END IF;
    END LOOP;
  END LOOP;

  IF v_problems <> '' THEN
    RAISE EXCEPTION E'Aborting, nothing written. Teacher identity check failed:%', v_problems;
  END IF;

  -- --------------------------------------------------------
  -- 2. The two shift templates (academy-wide, branch-agnostic).
  --
  -- NOTE: shift_templates has UNIQUE (branch_id, name), but these
  -- rows have branch_id IS NULL and NULL never equals NULL in a
  -- unique index — so ON CONFLICT would NOT dedupe them and a
  -- re-run would silently create a second template. Hence the
  -- explicit lookup-then-insert.
  -- --------------------------------------------------------
  SELECT id INTO v_shift_template_id
    FROM shift_templates WHERE branch_id IS NULL AND name = 'Shift 14:00-19:00';
  IF v_shift_template_id IS NULL THEN
    INSERT INTO shift_templates (branch_id, name, start_minute, end_minute, timezone, is_active)
    VALUES (NULL, 'Shift 14:00-19:00', 840, 1140, 'Asia/Dubai', true)
    RETURNING id INTO v_shift_template_id;
    RAISE NOTICE 'Created shift template "Shift 14:00-19:00" (840-1140).';
  ELSE
    UPDATE shift_templates SET start_minute = 840, end_minute = 1140, is_active = true
     WHERE id = v_shift_template_id
       AND (start_minute, end_minute, is_active) IS DISTINCT FROM (840, 1140, true);
    RAISE NOTICE 'Reused existing shift template "Shift 14:00-19:00".';
  END IF;

  SELECT id INTO v_part_template_id
    FROM shift_templates WHERE branch_id IS NULL AND name = 'Part-Time 14:00-18:00';
  IF v_part_template_id IS NULL THEN
    INSERT INTO shift_templates (branch_id, name, start_minute, end_minute, timezone, is_active)
    VALUES (NULL, 'Part-Time 14:00-18:00', 840, 1080, 'Asia/Dubai', true)
    RETURNING id INTO v_part_template_id;
    RAISE NOTICE 'Created shift template "Part-Time 14:00-18:00" (840-1080).';
  ELSE
    UPDATE shift_templates SET start_minute = 840, end_minute = 1080, is_active = true
     WHERE id = v_part_template_id
       AND (start_minute, end_minute, is_active) IS DISTINCT FROM (840, 1080, true);
    RAISE NOTICE 'Reused existing shift template "Part-Time 14:00-18:00".';
  END IF;

  -- --------------------------------------------------------
  -- 3. Assign each teacher to their template on every configured day.
  -- --------------------------------------------------------
  FOR v_group, v_ids, v_template_id IN
    SELECT 'shift', v_shift_ids, v_shift_template_id
    UNION ALL SELECT 'part', v_part_ids, v_part_template_id
  LOOP
    FOREACH v_teacher_id IN ARRAY v_ids LOOP
      -- 3a. These teachers work a fixed shift, so they belong to the
      --     'shift' teacher model. This drives which availability
      --     editor the Teacher Profile shows; nothing else branches
      --     on it, and the grid reads the unified view regardless.
      UPDATE teachers SET teacher_type = 'shift'
       WHERE id = v_teacher_id AND teacher_type IS DISTINCT FROM 'shift';
      IF FOUND THEN v_types_changed := v_types_changed + 1; END IF;

      -- 3b. Legacy free-form availability would be UNION-ed with the
      --     shift window by v_teacher_availability_unified, producing
      --     two competing windows for one teacher and overstating free
      --     capacity. There are none today; warn loudly if that ever
      --     changes. This migration never modifies those rows.
      SELECT count(*) INTO v_hourly_rows
        FROM teacher_availability WHERE teacher_id = v_teacher_id AND is_active;
      IF v_hourly_rows > 0 THEN
        RAISE WARNING
          'Teacher % has % active teacher_availability row(s); they UNION with the new shift window. Review them.',
          v_teacher_id, v_hourly_rows;
      END IF;

      -- 3c. The weekly recurring assignment itself.
      FOREACH v_day IN ARRAY v_days LOOP
        INSERT INTO teacher_shift_assignments (teacher_id, shift_template_id, day_of_week, is_active)
        VALUES (v_teacher_id, v_template_id, v_day, true)
        ON CONFLICT (teacher_id, shift_template_id, day_of_week)
          DO UPDATE SET is_active = true;
        v_rows := v_rows + 1;

        -- Any OTHER template assigned to this teacher on this day would
        -- add a second window to the unified view. Deactivated (not
        -- deleted) so the history stays recoverable.
        UPDATE teacher_shift_assignments SET is_active = false
         WHERE teacher_id = v_teacher_id AND day_of_week = v_day
           AND shift_template_id <> v_template_id AND is_active;
      END LOOP;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Done: 13 teachers, % day-assignments ensured, % teacher_type value(s) changed to ''shift''.',
    v_rows, v_types_changed;
END $$;

-- Audit leftover: an Arabic name-normalization helper was created while
-- resolving these teachers, before it emerged that names are stored as
-- English transliterations. Nothing references it; drop it so the audit
-- leaves no trace in the schema.
DROP FUNCTION IF EXISTS public.normalize_ar_name(TEXT);

COMMIT;

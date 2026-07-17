-- ============================================================
-- Migration 008: Scheduling Engine — Lessons, Conflict Prevention
--
-- Run this in: Supabase Dashboard → SQL Editor → Run
--
-- Phase 2 of the Scheduling Engine — the highest-risk migration.
-- Group-lesson-capable core model, redesigned after the real
-- spreadsheet showed ~40% of bookings have multiple students in
-- one teacher/slot:
--
--   * lessons        — the teacher+course+day+time recurring slot
--                       itself. No student_id column.
--   * lesson_participants — join table (1+ students per lesson).
--                       Carries denormalized day_of_week/time_range/
--                       lifecycle_status copied from the parent
--                       lesson by trigger, so it can carry its own
--                       EXCLUDE constraint — the actual unbypassable
--                       per-student double-booking guarantee, now
--                       that student_id isn't on lessons directly.
--   * lesson_exceptions — single-occurrence deviations (cancelled/
--                       rescheduled/completed/no_show), whole-lesson
--                       (whole-group) granularity. Per-student
--                       attendance nuance is future Attendance
--                       module scope, not modeled here.
--
-- Defense-in-depth conflict prevention (per the plan):
--   1. EXCLUDE USING gist constraints — the hard, unbypassable
--      guarantee (teacher on lessons, student on lesson_participants).
--   2. check_schedule_conflict() — STABLE, pure-read, used both as
--      the Change Simulator's dry-run preview and as a friendly
--      pre-check inside apply_schedule_change() before the real
--      write, so users get a helpful message instead of a raw
--      constraint-violation error the 0.1% of the time a race
--      actually hits the constraint.
--   3. apply_schedule_change() — VOLATILE, atomic check-then-write
--      for all schedule mutations (create/move/cancel/end/
--      add-participant/remove-participant).
--
-- Assumes migration 007 already enabled btree_gist.
--
-- Safe to re-run (CREATE TABLE IF NOT EXISTS, DROP POLICY/TRIGGER/
-- FUNCTION IF EXISTS).
-- ============================================================

-- ------------------------------------------------------------
-- lessons — the recurring teacher+course+day+time slot.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES branches(id),
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT,
  course_id UUID REFERENCES courses(id),
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_minute SMALLINT NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
  duration_minutes SMALLINT NOT NULL DEFAULT 30 CHECK (duration_minutes > 0),
  end_minute SMALLINT GENERATED ALWAYS AS (start_minute + duration_minutes) STORED,
  time_range int4range GENERATED ALWAYS AS (int4range(start_minute, start_minute + duration_minutes)) STORED,
  timezone TEXT NOT NULL DEFAULT 'Asia/Dubai',
  lifecycle_status TEXT NOT NULL DEFAULT 'trial' CHECK (lifecycle_status IN ('trial', 'active', 'paused', 'ended')),
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_until DATE,
  original_teacher_id UUID REFERENCES teachers(id),
  same_day_since DATE NOT NULL DEFAULT CURRENT_DATE,
  same_time_since DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES profiles(id),
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (start_minute + duration_minutes <= 1440),
  EXCLUDE USING gist (teacher_id WITH =, day_of_week WITH =, time_range WITH &&) WHERE (lifecycle_status IN ('trial', 'active'))
);

CREATE INDEX IF NOT EXISTS idx_lessons_teacher_id ON lessons (teacher_id);
CREATE INDEX IF NOT EXISTS idx_lessons_course_id ON lessons (course_id);
CREATE INDEX IF NOT EXISTS idx_lessons_day_status ON lessons (day_of_week, lifecycle_status);

-- ------------------------------------------------------------
-- lesson_participants — 1+ students per lesson. Denormalized
-- day_of_week/time_range/lifecycle_status are synced from the
-- parent lesson by trigger (below) so this table can carry its
-- own EXCLUDE constraint — the real per-student guarantee.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lesson_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  day_of_week SMALLINT NOT NULL,
  time_range int4range NOT NULL,
  lifecycle_status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lesson_id, student_id),
  EXCLUDE USING gist (student_id WITH =, day_of_week WITH =, time_range WITH &&) WHERE (lifecycle_status IN ('trial', 'active'))
);

CREATE INDEX IF NOT EXISTS idx_lesson_participants_lesson_id ON lesson_participants (lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_participants_student_id ON lesson_participants (student_id);

-- Populate denormalized columns from the parent lesson on insert.
CREATE OR REPLACE FUNCTION public.sync_lesson_participant_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  parent lessons%ROWTYPE;
BEGIN
  SELECT * INTO parent FROM lessons WHERE id = NEW.lesson_id;
  NEW.day_of_week := parent.day_of_week;
  NEW.time_range := parent.time_range;
  NEW.lifecycle_status := parent.lifecycle_status;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_lesson_participant_on_insert ON lesson_participants;
CREATE TRIGGER trg_sync_lesson_participant_on_insert
  BEFORE INSERT ON lesson_participants
  FOR EACH ROW EXECUTE FUNCTION public.sync_lesson_participant_on_insert();

-- Re-sync every participant row whenever the parent lesson's
-- day/time/status changes (e.g. "move this lesson permanently"
-- moves every participant with it, atomically).
CREATE OR REPLACE FUNCTION public.sync_lesson_participants_on_lesson_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.day_of_week IS DISTINCT FROM OLD.day_of_week
     OR NEW.time_range IS DISTINCT FROM OLD.time_range
     OR NEW.lifecycle_status IS DISTINCT FROM OLD.lifecycle_status THEN
    UPDATE lesson_participants
    SET day_of_week = NEW.day_of_week,
        time_range = NEW.time_range,
        lifecycle_status = NEW.lifecycle_status
    WHERE lesson_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_lesson_participants_on_lesson_update ON lessons;
CREATE TRIGGER trg_sync_lesson_participants_on_lesson_update
  AFTER UPDATE ON lessons
  FOR EACH ROW EXECUTE FUNCTION public.sync_lesson_participants_on_lesson_update();

-- ------------------------------------------------------------
-- lesson_exceptions — single-occurrence deviations, whole-lesson
-- (whole-group) granularity. Attendance is folded in here
-- (attendance_notes) rather than a separate table.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lesson_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  occurrence_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('cancelled', 'rescheduled', 'completed', 'no_show')),
  override_teacher_id UUID REFERENCES teachers(id),
  override_start_minute SMALLINT CHECK (override_start_minute BETWEEN 0 AND 1439),
  override_duration_minutes SMALLINT CHECK (override_duration_minutes > 0),
  override_time_range int4range GENERATED ALWAYS AS (
    CASE WHEN override_start_minute IS NOT NULL
      THEN int4range(override_start_minute, override_start_minute + COALESCE(override_duration_minutes, 30))
    END
  ) STORED,
  attendance_notes TEXT DEFAULT '',
  reason TEXT DEFAULT '',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lesson_id, occurrence_date),
  EXCLUDE USING gist (override_teacher_id WITH =, occurrence_date WITH =, override_time_range WITH &&)
    WHERE (status = 'rescheduled' AND override_teacher_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_lesson_exceptions_lesson_date ON lesson_exceptions (lesson_id, occurrence_date);

DROP TRIGGER IF EXISTS trg_lessons_updated_at ON lessons;
CREATE TRIGGER trg_lessons_updated_at
  BEFORE UPDATE ON lessons FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_lesson_exceptions_updated_at ON lesson_exceptions;
CREATE TRIGGER trg_lesson_exceptions_updated_at
  BEFORE UPDATE ON lesson_exceptions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ------------------------------------------------------------
-- RLS — same two-tier pattern as every other operational table.
-- ------------------------------------------------------------
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_exceptions ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl TEXT;
  op_tables TEXT[] := ARRAY['lessons', 'lesson_participants', 'lesson_exceptions'];
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
-- check_schedule_conflict — pure read, STABLE. The Change
-- Simulator's dry-run entry point and the pre-check inside
-- apply_schedule_change(). Checks both the teacher's slot and
-- every proposed student's slot.
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_schedule_conflict(
  p_teacher_id UUID,
  p_student_ids UUID[],
  p_day_of_week SMALLINT,
  p_start_minute SMALLINT,
  p_duration_minutes SMALLINT,
  p_exclude_lesson_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_range int4range := int4range(p_start_minute, p_start_minute + p_duration_minutes);
  v_teacher_conflict JSONB := NULL;
  v_student_conflicts JSONB := '[]'::JSONB;
  v_has_conflict BOOLEAN := false;
BEGIN
  SELECT jsonb_build_object('lesson_id', l.id, 'teacher_id', l.teacher_id)
  INTO v_teacher_conflict
  FROM lessons l
  WHERE l.teacher_id = p_teacher_id
    AND l.day_of_week = p_day_of_week
    AND l.lifecycle_status IN ('trial', 'active')
    AND l.time_range && v_range
    AND (p_exclude_lesson_id IS NULL OR l.id IS DISTINCT FROM p_exclude_lesson_id)
  LIMIT 1;

  IF v_teacher_conflict IS NOT NULL THEN
    v_has_conflict := true;
  END IF;

  SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object('student_id', lp.student_id, 'lesson_id', lp.lesson_id)), '[]'::JSONB)
  INTO v_student_conflicts
  FROM lesson_participants lp
  WHERE lp.student_id = ANY(p_student_ids)
    AND lp.day_of_week = p_day_of_week
    AND lp.lifecycle_status IN ('trial', 'active')
    AND lp.time_range && v_range
    AND (p_exclude_lesson_id IS NULL OR lp.lesson_id IS DISTINCT FROM p_exclude_lesson_id);

  IF jsonb_array_length(v_student_conflicts) > 0 THEN
    v_has_conflict := true;
  END IF;

  RETURN jsonb_build_object(
    'has_conflict', v_has_conflict,
    'teacher_conflict', v_teacher_conflict,
    'student_conflicts', v_student_conflicts,
    'message', CASE
      WHEN v_has_conflict AND v_teacher_conflict IS NOT NULL THEN 'Teacher is already booked at this time.'
      WHEN v_has_conflict THEN 'One or more students are already booked at this time.'
      ELSE 'Safe — no conflicts.'
    END
  );
END;
$$;

-- ============================================================
-- get_teacher_preservation_score — % reward for keeping the same
-- teacher/day/time, per Jawwid's core priority order.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_teacher_preservation_score(p_lesson_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_lesson lessons%ROWTYPE;
  v_teacher_component NUMERIC;
  v_day_component NUMERIC;
  v_time_component NUMERIC;
  v_total NUMERIC;
BEGIN
  SELECT * INTO v_lesson FROM lessons WHERE id = p_lesson_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_teacher_component := CASE WHEN v_lesson.teacher_id = v_lesson.original_teacher_id THEN 60 ELSE 0 END;
  v_day_component := LEAST(25, (CURRENT_DATE - v_lesson.same_day_since) / 30.0 * 25);
  v_time_component := LEAST(15, (CURRENT_DATE - v_lesson.same_time_since) / 30.0 * 15);
  v_total := ROUND(v_teacher_component + v_day_component + v_time_component);

  RETURN jsonb_build_object(
    'score', v_total,
    'teacher_preserved', v_lesson.teacher_id = v_lesson.original_teacher_id,
    'day_stable_days', CURRENT_DATE - v_lesson.same_day_since,
    'time_stable_days', CURRENT_DATE - v_lesson.same_time_since,
    'breakdown', jsonb_build_object(
      'teacher', v_teacher_component,
      'day', ROUND(v_day_component),
      'time', ROUND(v_time_component)
    )
  );
END;
$$;

-- ============================================================
-- apply_schedule_change — atomic check-then-write for every
-- schedule mutation. p_action selects the operation; p_payload
-- carries its arguments as jsonb (documented per action below).
--
-- Actions:
--   create_lesson       {teacher_id, course_id?, day_of_week, start_minute,
--                         duration_minutes, student_ids[], branch_id?, notes?}
--   move_lesson          {lesson_id, new_teacher_id?, new_day_of_week?,
--                         new_start_minute?, new_duration_minutes?,
--                         scope: 'this_occurrence'|'all_future', occurrence_date?}
--   cancel_occurrence     {lesson_id, occurrence_date, reason?}
--   end_lesson            {lesson_id, effective_until?}
--   add_participant       {lesson_id, student_id}
--   remove_participant    {lesson_id, student_id}
-- ============================================================
CREATE OR REPLACE FUNCTION public.apply_schedule_change(
  p_action TEXT,
  p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_lesson lessons%ROWTYPE;
  v_new_lesson_id UUID;
  v_conflict JSONB;
  v_student_ids UUID[];
  v_new_teacher_id UUID;
  v_new_day SMALLINT;
  v_new_start SMALLINT;
  v_new_duration SMALLINT;
BEGIN
  IF p_action = 'create_lesson' THEN
    v_student_ids := ARRAY(SELECT jsonb_array_elements_text(p_payload->'student_ids'))::UUID[];

    v_conflict := public.check_schedule_conflict(
      (p_payload->>'teacher_id')::UUID,
      v_student_ids,
      (p_payload->>'day_of_week')::SMALLINT,
      (p_payload->>'start_minute')::SMALLINT,
      COALESCE((p_payload->>'duration_minutes')::SMALLINT, 30::SMALLINT)
    );
    IF (v_conflict->>'has_conflict')::BOOLEAN THEN
      RAISE EXCEPTION 'schedule_conflict: %', v_conflict->>'message' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO lessons (branch_id, teacher_id, course_id, day_of_week, start_minute, duration_minutes, original_teacher_id, notes, created_by)
    VALUES (
      NULLIF(p_payload->>'branch_id', '')::UUID,
      (p_payload->>'teacher_id')::UUID,
      NULLIF(p_payload->>'course_id', '')::UUID,
      (p_payload->>'day_of_week')::SMALLINT,
      (p_payload->>'start_minute')::SMALLINT,
      COALESCE((p_payload->>'duration_minutes')::SMALLINT, 30),
      (p_payload->>'teacher_id')::UUID,
      COALESCE(p_payload->>'notes', ''),
      NULLIF(p_payload->>'created_by', '')::UUID
    )
    RETURNING id INTO v_new_lesson_id;

    INSERT INTO lesson_participants (lesson_id, student_id)
    SELECT v_new_lesson_id, sid FROM unnest(v_student_ids) AS sid;

    RETURN jsonb_build_object('lesson_id', v_new_lesson_id);

  ELSIF p_action = 'move_lesson' THEN
    SELECT * INTO v_lesson FROM lessons WHERE id = (p_payload->>'lesson_id')::UUID;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'lesson_not_found';
    END IF;

    v_new_teacher_id := COALESCE((p_payload->>'new_teacher_id')::UUID, v_lesson.teacher_id);
    v_new_day := COALESCE((p_payload->>'new_day_of_week')::SMALLINT, v_lesson.day_of_week);
    v_new_start := COALESCE((p_payload->>'new_start_minute')::SMALLINT, v_lesson.start_minute);
    v_new_duration := COALESCE((p_payload->>'new_duration_minutes')::SMALLINT, v_lesson.duration_minutes);

    SELECT ARRAY_AGG(student_id) INTO v_student_ids FROM lesson_participants WHERE lesson_id = v_lesson.id;

    v_conflict := public.check_schedule_conflict(
      v_new_teacher_id, COALESCE(v_student_ids, ARRAY[]::UUID[]), v_new_day, v_new_start, v_new_duration, v_lesson.id
    );
    IF (v_conflict->>'has_conflict')::BOOLEAN THEN
      RAISE EXCEPTION 'schedule_conflict: %', v_conflict->>'message' USING ERRCODE = 'P0001';
    END IF;

    IF p_payload->>'scope' = 'this_occurrence' THEN
      INSERT INTO lesson_exceptions (lesson_id, occurrence_date, status, override_teacher_id, override_start_minute, override_duration_minutes, reason)
      VALUES (
        v_lesson.id,
        (p_payload->>'occurrence_date')::DATE,
        'rescheduled',
        v_new_teacher_id,
        v_new_start,
        v_new_duration,
        COALESCE(p_payload->>'reason', '')
      )
      ON CONFLICT (lesson_id, occurrence_date) DO UPDATE SET
        status = 'rescheduled',
        override_teacher_id = EXCLUDED.override_teacher_id,
        override_start_minute = EXCLUDED.override_start_minute,
        override_duration_minutes = EXCLUDED.override_duration_minutes,
        reason = EXCLUDED.reason;

      RETURN jsonb_build_object('lesson_id', v_lesson.id, 'scope', 'this_occurrence');
    ELSE
      UPDATE lessons
      SET teacher_id = v_new_teacher_id,
          day_of_week = v_new_day,
          start_minute = v_new_start,
          duration_minutes = v_new_duration,
          same_day_since = CASE WHEN v_new_day IS DISTINCT FROM v_lesson.day_of_week THEN CURRENT_DATE ELSE v_lesson.same_day_since END,
          same_time_since = CASE WHEN v_new_start IS DISTINCT FROM v_lesson.start_minute THEN CURRENT_DATE ELSE v_lesson.same_time_since END
      WHERE id = v_lesson.id;

      RETURN jsonb_build_object('lesson_id', v_lesson.id, 'scope', 'all_future');
    END IF;

  ELSIF p_action = 'cancel_occurrence' THEN
    INSERT INTO lesson_exceptions (lesson_id, occurrence_date, status, reason)
    VALUES ((p_payload->>'lesson_id')::UUID, (p_payload->>'occurrence_date')::DATE, 'cancelled', COALESCE(p_payload->>'reason', ''))
    ON CONFLICT (lesson_id, occurrence_date) DO UPDATE SET status = 'cancelled', reason = EXCLUDED.reason;
    RETURN jsonb_build_object('lesson_id', (p_payload->>'lesson_id')::UUID, 'action', 'cancel_occurrence');

  ELSIF p_action = 'end_lesson' THEN
    UPDATE lessons
    SET lifecycle_status = 'ended',
        effective_until = COALESCE((p_payload->>'effective_until')::DATE, CURRENT_DATE)
    WHERE id = (p_payload->>'lesson_id')::UUID;
    RETURN jsonb_build_object('lesson_id', (p_payload->>'lesson_id')::UUID, 'action', 'end_lesson');

  ELSIF p_action = 'add_participant' THEN
    SELECT * INTO v_lesson FROM lessons WHERE id = (p_payload->>'lesson_id')::UUID;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'lesson_not_found';
    END IF;

    v_conflict := public.check_schedule_conflict(
      v_lesson.teacher_id, ARRAY[(p_payload->>'student_id')::UUID], v_lesson.day_of_week, v_lesson.start_minute, v_lesson.duration_minutes, v_lesson.id
    );
    IF (v_conflict->>'has_conflict')::BOOLEAN THEN
      RAISE EXCEPTION 'schedule_conflict: %', v_conflict->>'message' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO lesson_participants (lesson_id, student_id)
    VALUES (v_lesson.id, (p_payload->>'student_id')::UUID);
    RETURN jsonb_build_object('lesson_id', v_lesson.id, 'action', 'add_participant');

  ELSIF p_action = 'remove_participant' THEN
    DELETE FROM lesson_participants
    WHERE lesson_id = (p_payload->>'lesson_id')::UUID AND student_id = (p_payload->>'student_id')::UUID;
    RETURN jsonb_build_object('lesson_id', (p_payload->>'lesson_id')::UUID, 'action', 'remove_participant');

  ELSE
    RAISE EXCEPTION 'unknown_action: %', p_action;
  END IF;
END;
$$;

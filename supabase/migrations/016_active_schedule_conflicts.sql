-- ============================================================
-- Migration 016: Proactive Active Schedule Conflict Detection
--
-- Run this in: Supabase Dashboard → SQL Editor → Run
--
-- Phase 4 of the Scheduling Data Foundation plan. The EXCLUDE USING
-- gist constraints on lessons/lesson_participants (migration 008)
-- already PREVENT new conflicts among trial/active lessons going
-- forward. This migration adds the missing DETECTION/REPORTING
-- side for anything already in the data (e.g. legacy-imported rows
-- inserted outside apply_schedule_change) — a read-only, set-based
-- SQL function, not a frontend loop making one RPC call per pair.
--
-- Returns raw facts/codes only (conflict_type, entity ids, lesson
-- ids, day/time). No translated strings — the frontend localizes.
--
-- Safe to re-run (CREATE OR REPLACE FUNCTION).
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_active_schedule_conflicts()
RETURNS TABLE (
  conflict_type TEXT,
  teacher_id UUID,
  student_id UUID,
  lesson_id_a UUID,
  lesson_id_b UUID,
  day_of_week SMALLINT,
  start_minute_a SMALLINT,
  duration_minutes_a SMALLINT,
  start_minute_b SMALLINT,
  duration_minutes_b SMALLINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Teacher double-booking: same teacher, same day, overlapping time_range,
  -- both sides still trial/active. l1.id < l2.id avoids mirrored duplicate pairs.
  SELECT
    'teacher_double_booking'::TEXT AS conflict_type,
    l1.teacher_id,
    NULL::UUID AS student_id,
    l1.id AS lesson_id_a,
    l2.id AS lesson_id_b,
    l1.day_of_week,
    l1.start_minute AS start_minute_a,
    l1.duration_minutes AS duration_minutes_a,
    l2.start_minute AS start_minute_b,
    l2.duration_minutes AS duration_minutes_b
  FROM lessons l1
  JOIN lessons l2
    ON l1.teacher_id = l2.teacher_id
   AND l1.day_of_week = l2.day_of_week
   AND l1.id < l2.id
   AND l1.time_range && l2.time_range
  WHERE l1.lifecycle_status IN ('trial', 'active')
    AND l2.lifecycle_status IN ('trial', 'active')

  UNION ALL

  -- Student double-booking: same student, same day, overlapping time_range,
  -- read from lesson_participants (which carries its own denormalized
  -- day_of_week/time_range synced from the parent lesson).
  SELECT
    'student_double_booking'::TEXT AS conflict_type,
    NULL::UUID AS teacher_id,
    lp1.student_id,
    lp1.lesson_id AS lesson_id_a,
    lp2.lesson_id AS lesson_id_b,
    lp1.day_of_week,
    lower(lp1.time_range)::SMALLINT AS start_minute_a,
    (upper(lp1.time_range) - lower(lp1.time_range))::SMALLINT AS duration_minutes_a,
    lower(lp2.time_range)::SMALLINT AS start_minute_b,
    (upper(lp2.time_range) - lower(lp2.time_range))::SMALLINT AS duration_minutes_b
  FROM lesson_participants lp1
  JOIN lesson_participants lp2
    ON lp1.student_id = lp2.student_id
   AND lp1.day_of_week = lp2.day_of_week
   AND lp1.lesson_id < lp2.lesson_id
   AND lp1.time_range && lp2.time_range
  WHERE lp1.lifecycle_status IN ('trial', 'active')
    AND lp2.lifecycle_status IN ('trial', 'active');
$$;

GRANT EXECUTE ON FUNCTION public.get_active_schedule_conflicts() TO authenticated;

-- ============================================================
-- Migration 018: Fix ambiguous column in get_primary_teacher_inference_report()
--
-- Run this in: Supabase Dashboard → SQL Editor → Run
--
-- Migration 017's function was LANGUAGE plpgsql with RETURN QUERY. Its
-- RETURNS TABLE output columns (student_id, teacher_id,
-- analyzed_lesson_count, distinct_teacher_count, most_recent_lesson_since)
-- are treated by PL/pgSQL as in-scope variables, which collided with
-- identically-named columns inside the CTEs:
--
--   ERROR: 42702: column reference "student_id" is ambiguous
--
-- Fix: rewrite as LANGUAGE sql (matching get_active_schedule_conflicts'
-- existing pattern — no PL/pgSQL variable scope, so no collision is
-- possible), and rename every CTE column to a distinct prefix (lj_/total_/
-- last_) so nothing can ever again collide with the RETURNS TABLE names.
-- Same logic, same thresholds, still 100% read-only (SELECT only).
--
-- Safe to re-run (CREATE OR REPLACE FUNCTION).
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_primary_teacher_inference_report()
RETURNS TABLE (
  student_id UUID,
  student_name TEXT,
  candidate_teacher_id UUID,
  candidate_teacher_name TEXT,
  analyzed_lesson_count INT,
  candidate_lesson_count INT,
  candidate_share_pct NUMERIC,
  distinct_teacher_count INT,
  most_recent_lesson_since TIMESTAMPTZ,
  second_candidate_teacher_id UUID,
  second_candidate_teacher_name TEXT,
  second_candidate_share_pct NUMERIC,
  confirmed_teacher_id UUID,
  confirmed_teacher_name TEXT,
  confidence TEXT,
  status TEXT,
  reason_code TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH thresholds AS (
    -- Centralized thresholds — see migration 017's header for rationale.
    SELECT 2::INT AS min_lessons_reliable, 90::NUMERIC AS high_share_pct, 70::NUMERIC AS medium_share_pct
  ),
  lesson_join AS (
    SELECT lp.student_id AS lj_student_id, l.teacher_id AS lj_teacher_id, l.created_at AS lj_created_at
    FROM lesson_participants lp
    JOIN lessons l ON l.id = lp.lesson_id
    WHERE lp.lifecycle_status IN ('trial', 'active')
      AND l.lifecycle_status IN ('trial', 'active')
  ),
  teacher_counts AS (
    SELECT
      lj_student_id,
      lj_teacher_id,
      count(*) AS lesson_count,
      max(lj_created_at) AS last_lesson_since,
      row_number() OVER (
        PARTITION BY lj_student_id ORDER BY count(*) DESC, max(lj_created_at) DESC, lj_teacher_id
      ) AS rn
    FROM lesson_join
    GROUP BY lj_student_id, lj_teacher_id
  ),
  student_totals AS (
    SELECT lj_student_id, count(*) AS total_lessons, count(DISTINCT lj_teacher_id) AS total_distinct_teachers
    FROM lesson_join
    GROUP BY lj_student_id
  )
  SELECT
    s.id,
    s.full_name,
    top1.lj_teacher_id,
    t1.full_name,
    COALESCE(st.total_lessons, 0)::INT,
    COALESCE(top1.lesson_count, 0)::INT,
    CASE WHEN COALESCE(st.total_lessons, 0) > 0
      THEN ROUND(100.0 * top1.lesson_count / st.total_lessons, 1) END,
    COALESCE(st.total_distinct_teachers, 0)::INT,
    top1.last_lesson_since,
    top2.lj_teacher_id,
    t2.full_name,
    CASE WHEN COALESCE(st.total_lessons, 0) > 0 AND top2.lesson_count IS NOT NULL
      THEN ROUND(100.0 * top2.lesson_count / st.total_lessons, 1) END,
    sta.teacher_id,
    tc.full_name,
    CASE
      WHEN sta.teacher_id IS NOT NULL THEN 'high'
      WHEN COALESCE(st.total_lessons, 0) = 0 THEN NULL
      WHEN st.total_lessons < th.min_lessons_reliable THEN 'insufficient'
      WHEN (100.0 * top1.lesson_count / st.total_lessons) >= th.high_share_pct THEN 'high'
      WHEN (100.0 * top1.lesson_count / st.total_lessons) >= th.medium_share_pct THEN 'medium'
      ELSE 'low'
    END,
    CASE
      WHEN sta.teacher_id IS NOT NULL THEN 'confirmed'
      WHEN COALESCE(st.total_lessons, 0) = 0 THEN 'no_candidate'
      WHEN st.total_lessons < th.min_lessons_reliable THEN 'needs_review'
      WHEN (100.0 * top1.lesson_count / st.total_lessons) >= th.medium_share_pct THEN 'inferred'
      ELSE 'needs_review'
    END,
    CASE
      WHEN sta.teacher_id IS NOT NULL THEN 'confirmed_assignment_exists'
      WHEN COALESCE(st.total_lessons, 0) = 0 THEN 'no_active_lessons'
      WHEN st.total_lessons < th.min_lessons_reliable THEN 'below_minimum_lesson_count'
      WHEN (100.0 * top1.lesson_count / st.total_lessons) >= th.high_share_pct THEN 'single_teacher_majority_high'
      WHEN (100.0 * top1.lesson_count / st.total_lessons) >= th.medium_share_pct THEN 'single_teacher_majority_medium'
      ELSE 'multiple_teachers_no_clear_majority'
    END
  FROM students s
  CROSS JOIN thresholds th
  LEFT JOIN teacher_counts top1 ON top1.lj_student_id = s.id AND top1.rn = 1
  LEFT JOIN teacher_counts top2 ON top2.lj_student_id = s.id AND top2.rn = 2
  LEFT JOIN student_totals st ON st.lj_student_id = s.id
  LEFT JOIN teachers t1 ON t1.id = top1.lj_teacher_id
  LEFT JOIN teachers t2 ON t2.id = top2.lj_teacher_id
  LEFT JOIN student_teacher_assignments sta ON sta.student_id = s.id AND sta.ended_at IS NULL
  LEFT JOIN teachers tc ON tc.id = sta.teacher_id
  WHERE s.status = 'active' AND s.is_deleted = false;
$$;

GRANT EXECUTE ON FUNCTION public.get_primary_teacher_inference_report() TO authenticated;

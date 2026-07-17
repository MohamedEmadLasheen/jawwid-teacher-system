-- ============================================================
-- Migration 017: Student Primary Teacher Assignment + Inference Report
--
-- Run this in: Supabase Dashboard → SQL Editor → Run
--
-- Task B of the Scheduling Data Foundation V1 plan. Two parts:
--
--   1. student_teacher_assignments — the new source of truth for a
--      student's PRIMARY teacher, explicitly separate from whichever
--      teacher_id happens to be on a given lesson (a lesson's teacher
--      can be a temporary substitute without ever touching this table).
--      Starts EMPTY — nothing here writes a row.
--
--   2. get_primary_teacher_inference_report() — a read-only, set-based
--      SQL function that proposes CONFIRMED / INFERRED / NEEDS REVIEW
--      candidates from existing lesson_participants/lessons history.
--      Pure SELECT — no INSERT/UPDATE/DELETE anywhere in this function.
--      It does not populate student_teacher_assignments; that remains
--      a human-approval step (Task C, not built here).
--
-- Reuses the exact RLS tier already used for lessons/lesson_participants/
-- lesson_exceptions (migration 008): select/insert/update = authenticated,
-- delete = is_admin_level(). No new authorization model invented.
--
-- Safe to re-run (CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE FUNCTION).
-- ============================================================

-- ------------------------------------------------------------
-- student_teacher_assignments — current + historical primary teacher.
-- Exactly one CURRENT (ended_at IS NULL) row per student, enforced by
-- a partial unique index. Does not reference or mutate lessons in any way.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_teacher_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT,
  started_at DATE NOT NULL DEFAULT CURRENT_DATE,
  ended_at DATE,
  source TEXT NOT NULL DEFAULT 'confirmed_manual'
    CHECK (source IN ('confirmed_manual', 'confirmed_import', 'inferred_pending_review')),
  notes TEXT DEFAULT '',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);

-- Exactly one current assignment per student — the "no overlapping active
-- primary teacher assignments" integrity rule, via a partial unique index
-- (cheaper and sufficient here; no time-range overlap is possible since
-- only one row per student can ever have ended_at IS NULL at a time).
CREATE UNIQUE INDEX IF NOT EXISTS idx_student_teacher_assignments_current
  ON student_teacher_assignments (student_id) WHERE (ended_at IS NULL);

CREATE INDEX IF NOT EXISTS idx_student_teacher_assignments_student_id ON student_teacher_assignments (student_id);
CREATE INDEX IF NOT EXISTS idx_student_teacher_assignments_teacher_id ON student_teacher_assignments (teacher_id);

DROP TRIGGER IF EXISTS trg_student_teacher_assignments_updated_at ON student_teacher_assignments;
CREATE TRIGGER trg_student_teacher_assignments_updated_at
  BEFORE UPDATE ON student_teacher_assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE student_teacher_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "student_teacher_assignments_select" ON student_teacher_assignments;
DROP POLICY IF EXISTS "student_teacher_assignments_insert" ON student_teacher_assignments;
DROP POLICY IF EXISTS "student_teacher_assignments_update" ON student_teacher_assignments;
DROP POLICY IF EXISTS "student_teacher_assignments_delete" ON student_teacher_assignments;

CREATE POLICY "student_teacher_assignments_select" ON student_teacher_assignments
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "student_teacher_assignments_insert" ON student_teacher_assignments
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "student_teacher_assignments_update" ON student_teacher_assignments
  FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "student_teacher_assignments_delete" ON student_teacher_assignments
  FOR DELETE USING (public.is_admin_level());

-- ============================================================
-- get_primary_teacher_inference_report() — read-only, set-based.
-- Proposes a primary-teacher candidate per active student from real
-- lesson_participants/lessons history. Never writes to
-- student_teacher_assignments or any other table.
--
-- Thresholds (centralized here — the single source of truth, not
-- duplicated in application code):
--   v_min_lessons_reliable = 2   — Jawwid students typically hold only
--     1-3 concurrent recurring lesson slots (average ~2 lessons/week),
--     so this floor is deliberately small: below it, evidence is too
--     thin to trust (a single recurring slot is still evidence, but
--     not enough to call reliable).
--   v_high_share_pct = 90        — candidate teacher must account for
--     at least 90% of the student's analyzed active lessons for HIGH.
--   v_medium_share_pct = 70      — 70-89% for MEDIUM; below 70% is
--     NEEDS REVIEW (no clear majority).
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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min_lessons_reliable CONSTANT INT := 2;
  v_high_share_pct CONSTANT NUMERIC := 90;
  v_medium_share_pct CONSTANT NUMERIC := 70;
BEGIN
  RETURN QUERY
  WITH lesson_join AS (
    -- Meaningful = currently in-force recurring slots only (trial/active on
    -- both the lesson and the participant row) — same status filter already
    -- used by the EXCLUDE constraints and get_active_schedule_conflicts();
    -- no new status values invented.
    SELECT lp.student_id, l.teacher_id, l.id AS lesson_id, l.created_at
    FROM lesson_participants lp
    JOIN lessons l ON l.id = lp.lesson_id
    WHERE lp.lifecycle_status IN ('trial', 'active')
      AND l.lifecycle_status IN ('trial', 'active')
  ),
  teacher_counts AS (
    SELECT
      student_id,
      teacher_id,
      count(*) AS lesson_count,
      max(created_at) AS most_recent_lesson_since,
      row_number() OVER (
        PARTITION BY student_id ORDER BY count(*) DESC, max(created_at) DESC, teacher_id
      ) AS rn
    FROM lesson_join
    GROUP BY student_id, teacher_id
  ),
  student_totals AS (
    SELECT student_id, count(*) AS analyzed_lesson_count, count(DISTINCT teacher_id) AS distinct_teacher_count
    FROM lesson_join
    GROUP BY student_id
  )
  SELECT
    s.id,
    s.full_name,
    top1.teacher_id,
    t1.full_name,
    COALESCE(st.analyzed_lesson_count, 0)::INT,
    COALESCE(top1.lesson_count, 0)::INT,
    CASE WHEN COALESCE(st.analyzed_lesson_count, 0) > 0
      THEN ROUND(100.0 * top1.lesson_count / st.analyzed_lesson_count, 1) END,
    COALESCE(st.distinct_teacher_count, 0)::INT,
    top1.most_recent_lesson_since,
    top2.teacher_id,
    t2.full_name,
    CASE WHEN COALESCE(st.analyzed_lesson_count, 0) > 0 AND top2.lesson_count IS NOT NULL
      THEN ROUND(100.0 * top2.lesson_count / st.analyzed_lesson_count, 1) END,
    sta.teacher_id,
    tc.full_name,
    -- confidence
    CASE
      WHEN sta.teacher_id IS NOT NULL THEN 'high'
      WHEN COALESCE(st.analyzed_lesson_count, 0) = 0 THEN NULL
      WHEN st.analyzed_lesson_count < v_min_lessons_reliable THEN 'insufficient'
      WHEN (100.0 * top1.lesson_count / st.analyzed_lesson_count) >= v_high_share_pct THEN 'high'
      WHEN (100.0 * top1.lesson_count / st.analyzed_lesson_count) >= v_medium_share_pct THEN 'medium'
      ELSE 'low'
    END,
    -- status — CONFIRMED only reflects a real existing row in
    -- student_teacher_assignments; everything else stays INFERRED /
    -- NEEDS REVIEW / NO CANDIDATE. Never elevated to confirmed by this function.
    CASE
      WHEN sta.teacher_id IS NOT NULL THEN 'confirmed'
      WHEN COALESCE(st.analyzed_lesson_count, 0) = 0 THEN 'no_candidate'
      WHEN st.analyzed_lesson_count < v_min_lessons_reliable THEN 'needs_review'
      WHEN (100.0 * top1.lesson_count / st.analyzed_lesson_count) >= v_medium_share_pct THEN 'inferred'
      ELSE 'needs_review'
    END,
    -- reason_code — structured, for the frontend to localize later; no
    -- English sentences generated here.
    CASE
      WHEN sta.teacher_id IS NOT NULL THEN 'confirmed_assignment_exists'
      WHEN COALESCE(st.analyzed_lesson_count, 0) = 0 THEN 'no_active_lessons'
      WHEN st.analyzed_lesson_count < v_min_lessons_reliable THEN 'below_minimum_lesson_count'
      WHEN (100.0 * top1.lesson_count / st.analyzed_lesson_count) >= v_high_share_pct THEN 'single_teacher_majority_high'
      WHEN (100.0 * top1.lesson_count / st.analyzed_lesson_count) >= v_medium_share_pct THEN 'single_teacher_majority_medium'
      ELSE 'multiple_teachers_no_clear_majority'
    END
  FROM students s
  LEFT JOIN teacher_counts top1 ON top1.student_id = s.id AND top1.rn = 1
  LEFT JOIN teacher_counts top2 ON top2.student_id = s.id AND top2.rn = 2
  LEFT JOIN student_totals st ON st.student_id = s.id
  LEFT JOIN teachers t1 ON t1.id = top1.teacher_id
  LEFT JOIN teachers t2 ON t2.id = top2.teacher_id
  LEFT JOIN student_teacher_assignments sta ON sta.student_id = s.id AND sta.ended_at IS NULL
  LEFT JOIN teachers tc ON tc.id = sta.teacher_id
  WHERE s.status = 'active' AND s.is_deleted = false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_primary_teacher_inference_report() TO authenticated;

-- ============================================================
-- Migration 019: confirm_primary_teacher_assignment() — atomic write RPC
--
-- Run this in: Supabase Dashboard → SQL Editor → Run
--
-- Task C of the Scheduling Data Foundation V1 plan. The ONLY way a row in
-- student_teacher_assignments becomes source = 'confirmed_manual' is through
-- this function, called only after explicit human confirmation in the UI
-- (Primary Teacher Review page). It never reads or writes inference data,
-- lessons, or lesson_participants.
--
-- Atomicity: ends the student's current assignment (if any) and inserts the
-- new current assignment in one function invocation (one transaction), so a
-- student can never be left with two current (ended_at IS NULL) rows — the
-- partial unique index from migration 017 is the final backstop if two
-- concurrent calls ever race.
--
-- Safe to re-run (CREATE OR REPLACE FUNCTION).
-- ============================================================

CREATE OR REPLACE FUNCTION public.confirm_primary_teacher_assignment(
  p_student_id UUID,
  p_teacher_id UUID,
  p_created_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  -- Already the current assignment — nothing to change.
  SELECT id INTO v_id
  FROM student_teacher_assignments
  WHERE student_id = p_student_id AND teacher_id = p_teacher_id AND ended_at IS NULL;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  -- End any existing current assignment for this student (usually none, for a
  -- first-time confirmation; exactly one, if this is a primary teacher change).
  UPDATE student_teacher_assignments
  SET ended_at = CURRENT_DATE
  WHERE student_id = p_student_id AND ended_at IS NULL;

  INSERT INTO student_teacher_assignments (student_id, teacher_id, started_at, ended_at, source, created_by)
  VALUES (p_student_id, p_teacher_id, CURRENT_DATE, NULL, 'confirmed_manual', p_created_by)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_primary_teacher_assignment(UUID, UUID, UUID) TO authenticated;

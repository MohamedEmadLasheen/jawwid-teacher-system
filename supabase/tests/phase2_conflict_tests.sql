-- ============================================================
-- Phase 2 mandatory SQL gate — Scheduling Engine conflict tests
--
-- Run this in: Supabase Dashboard → SQL Editor → Run
-- (after migrations 005-008 have been applied)
--
-- Proves:
--   1. Overlapping teacher lessons are rejected by the lessons
--      EXCLUDE constraint.
--   2. Overlapping student bookings (via lesson_participants,
--      different teachers/lessons) are rejected by its EXCLUDE
--      constraint — the group-lesson-era per-student guarantee.
--   3. check_schedule_conflict() correctly reports a free slot as
--      safe and a known-occupied one as conflicting.
--   4. apply_schedule_change() with scope='this_occurrence' creates
--      exactly one lesson_exceptions row and does not alter the
--      base lessons row.
--   5. scope='all_future' updates the base lessons row directly.
--
-- The whole script runs inside one transaction and ROLLS BACK at
-- the end — safe to run against any environment (including
-- production) without leaving residue, since every row it touches
-- is a throwaway TEST_ prefixed teacher/student/course created and
-- destroyed within this same transaction.
--
-- Each test RAISE NOTICEs "PASSED" or RAISE EXCEPTIONs "FAILED" —
-- if the whole script completes without an unhandled exception,
-- every test passed. Read the NOTICE output to confirm all 5 ran.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_teacher_a UUID;
  v_teacher_b UUID;
  v_teacher_c UUID;
  v_student_a UUID;
  v_student_b UUID;
  v_course_id UUID;
  v_lesson_1 UUID;
  v_lesson_2 UUID;
  v_lesson_3 UUID;
  v_conflict JSONB;
  v_exception_count INT;
  v_lesson_after lessons%ROWTYPE;
BEGIN
  -- ------------------------------------------------------------
  -- Setup: throwaway teacher/student/course rows.
  -- ------------------------------------------------------------
  INSERT INTO teachers (full_name, teacher_type) VALUES ('TEST_Teacher_A', 'hourly') RETURNING id INTO v_teacher_a;
  INSERT INTO teachers (full_name, teacher_type) VALUES ('TEST_Teacher_B', 'hourly') RETURNING id INTO v_teacher_b;
  INSERT INTO teachers (full_name, teacher_type) VALUES ('TEST_Teacher_C', 'hourly') RETURNING id INTO v_teacher_c;
  INSERT INTO students (full_name) VALUES ('TEST_Student_A') RETURNING id INTO v_student_a;
  INSERT INTO students (full_name) VALUES ('TEST_Student_B') RETURNING id INTO v_student_b;
  INSERT INTO courses (name_en, name_ar, category) VALUES ('TEST Course', 'مادة اختبار', 'quran') RETURNING id INTO v_course_id;

  -- ------------------------------------------------------------
  -- Test 1: overlapping TEACHER lessons rejected by EXCLUDE.
  -- Lesson at Tuesday(1) 10:00-11:00 (600-660), then an overlapping
  -- one at 10:20-10:50 (620-650) for the SAME teacher.
  -- ------------------------------------------------------------
  INSERT INTO lessons (teacher_id, course_id, day_of_week, start_minute, duration_minutes, original_teacher_id)
  VALUES (v_teacher_a, v_course_id, 1, 600, 60, v_teacher_a) RETURNING id INTO v_lesson_1;

  BEGIN
    INSERT INTO lessons (teacher_id, course_id, day_of_week, start_minute, duration_minutes, original_teacher_id)
    VALUES (v_teacher_a, v_course_id, 1, 620, 30, v_teacher_a);
    RAISE EXCEPTION 'TEST 1 FAILED: overlapping teacher lesson was NOT rejected';
  EXCEPTION WHEN exclusion_violation THEN
    RAISE NOTICE 'TEST 1 PASSED: overlapping teacher lesson correctly rejected by EXCLUDE constraint';
  END;

  -- ------------------------------------------------------------
  -- Test 2: overlapping STUDENT booking (different teacher/lesson)
  -- rejected by lesson_participants' EXCLUDE constraint.
  -- ------------------------------------------------------------
  INSERT INTO lesson_participants (lesson_id, student_id) VALUES (v_lesson_1, v_student_a);

  INSERT INTO lessons (teacher_id, course_id, day_of_week, start_minute, duration_minutes, original_teacher_id)
  VALUES (v_teacher_b, v_course_id, 1, 630, 30, v_teacher_b) RETURNING id INTO v_lesson_2;

  BEGIN
    INSERT INTO lesson_participants (lesson_id, student_id) VALUES (v_lesson_2, v_student_a);
    RAISE EXCEPTION 'TEST 2 FAILED: overlapping student booking was NOT rejected';
  EXCEPTION WHEN exclusion_violation THEN
    RAISE NOTICE 'TEST 2 PASSED: overlapping student booking correctly rejected by EXCLUDE constraint';
  END;

  -- ------------------------------------------------------------
  -- Test 3: check_schedule_conflict() reports free vs occupied.
  -- Teacher C, Wednesday(2), is genuinely free at 900-930.
  -- Teacher A is occupied at 600-660 (from Test 1's lesson).
  -- ------------------------------------------------------------
  v_conflict := public.check_schedule_conflict(v_teacher_c, ARRAY[v_student_b], 2, 900, 30);
  IF (v_conflict->>'has_conflict')::BOOLEAN THEN
    RAISE EXCEPTION 'TEST 3a FAILED: free slot incorrectly reported as conflicting';
  END IF;
  RAISE NOTICE 'TEST 3a PASSED: genuinely free slot correctly reported as safe';

  v_conflict := public.check_schedule_conflict(v_teacher_a, ARRAY[v_student_b], 1, 610, 30);
  IF NOT (v_conflict->>'has_conflict')::BOOLEAN THEN
    RAISE EXCEPTION 'TEST 3b FAILED: known-occupied teacher slot NOT reported as conflicting';
  END IF;
  RAISE NOTICE 'TEST 3b PASSED: known-occupied slot correctly reported as conflicting';

  -- ------------------------------------------------------------
  -- Test 4: apply_schedule_change 'this_occurrence' creates
  -- exactly one lesson_exceptions row, base lesson unchanged.
  -- ------------------------------------------------------------
  PERFORM public.apply_schedule_change('move_lesson', jsonb_build_object(
    'lesson_id', v_lesson_1,
    'new_start_minute', 700,
    'scope', 'this_occurrence',
    'occurrence_date', CURRENT_DATE
  ));

  SELECT COUNT(*) INTO v_exception_count FROM lesson_exceptions WHERE lesson_id = v_lesson_1;
  IF v_exception_count != 1 THEN
    RAISE EXCEPTION 'TEST 4a FAILED: expected exactly 1 lesson_exceptions row, found %', v_exception_count;
  END IF;

  SELECT * INTO v_lesson_after FROM lessons WHERE id = v_lesson_1;
  IF v_lesson_after.start_minute != 600 THEN
    RAISE EXCEPTION 'TEST 4b FAILED: base lesson start_minute changed (expected 600, got %)', v_lesson_after.start_minute;
  END IF;
  RAISE NOTICE 'TEST 4 PASSED: this_occurrence created exactly one exception, base lesson untouched';

  -- ------------------------------------------------------------
  -- Test 5: apply_schedule_change 'all_future' updates the base
  -- lessons row directly (using Teacher C's genuinely free slot).
  -- ------------------------------------------------------------
  INSERT INTO lessons (teacher_id, course_id, day_of_week, start_minute, duration_minutes, original_teacher_id)
  VALUES (v_teacher_c, v_course_id, 3, 500, 30, v_teacher_c) RETURNING id INTO v_lesson_3;

  PERFORM public.apply_schedule_change('move_lesson', jsonb_build_object(
    'lesson_id', v_lesson_3,
    'new_start_minute', 900,
    'new_day_of_week', 4,
    'scope', 'all_future'
  ));

  SELECT * INTO v_lesson_after FROM lessons WHERE id = v_lesson_3;
  IF v_lesson_after.start_minute != 900 OR v_lesson_after.day_of_week != 4 THEN
    RAISE EXCEPTION 'TEST 5 FAILED: base lesson not updated (start=%, day=%)', v_lesson_after.start_minute, v_lesson_after.day_of_week;
  END IF;
  RAISE NOTICE 'TEST 5 PASSED: all_future correctly updated the base lesson row';

  RAISE NOTICE '=== ALL 6 CHECKS PASSED ===';
END $$;

ROLLBACK;

-- ============================================================
-- Fix apply_schedule_change('create_lesson', ...): the inline
-- COALESCE(..., 30) passed a bare integer literal into
-- check_schedule_conflict's SMALLINT p_duration_minutes
-- parameter. An untyped numeric literal unifies COALESCE's
-- result to INTEGER (int4->int2 is assignment-only, not
-- implicit), so PostgREST/Postgres rejected every create_lesson
-- call with "function check_schedule_conflict(uuid, uuid[],
-- smallint, smallint, integer) does not exist" — blocking all
-- lesson creation. Fix: cast the literal to SMALLINT explicitly.
-- Redefinition of the same function from 008_lessons_and_conflicts.sql,
-- otherwise unchanged.
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
      v_lesson.teacher_id, ARRAY[(p_payload->>'student_id')::UUID], v_lesson.day_of_week, v_lesson.start_minute, v_lesson.duration_minutes
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

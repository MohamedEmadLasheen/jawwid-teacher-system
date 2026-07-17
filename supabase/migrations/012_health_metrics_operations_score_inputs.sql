-- ============================================================
-- Extends get_schedule_health_metrics() with the additional raw
-- inputs the AI Operations Coach's scoring engine needs, reusing
-- the same teacher_stats/CTEs already computed in this function
-- rather than adding a second aggregate function:
--   - teachers_above_95pct_count / teachers_below_40pct_count
--     (from the existing teacher_stats CTE)
--   - prime_time_occupancy_pct (from the existing prime_time CTEs)
--   - paused_students_schedulable_count (new: a paused student counts
--     if any teacher whose specialization matches the student's course
--     — or any teacher at all if the student has no course yet — has an
--     availability block with no overlapping active/trial lesson at all;
--     a coarse "some real capacity exists" signal for the dashboard, not
--     a scheduling guarantee)
-- All pre-existing fields (teacher_occupancy_rate, total_empty_hours,
-- unused_prime_time_hours, most/least_occupied_teacher,
-- total_available_bookable_slots) are unchanged.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_schedule_health_metrics()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_prime_start CONSTANT SMALLINT := 13 * 60; -- 1:00 PM Asia/Dubai
  v_prime_end CONSTANT SMALLINT := 18 * 60;   -- 6:00 PM Asia/Dubai
  v_result JSONB;
BEGIN
  WITH teacher_capacity AS (
    SELECT teacher_id, SUM(end_minute - start_minute) AS available_minutes
    FROM v_teacher_availability_unified
    GROUP BY teacher_id
  ),
  teacher_booked AS (
    SELECT teacher_id, SUM(duration_minutes) AS booked_minutes
    FROM lessons
    WHERE lifecycle_status IN ('trial', 'active')
    GROUP BY teacher_id
  ),
  teacher_stats AS (
    SELECT
      t.id AS teacher_id,
      t.full_name,
      COALESCE(c.available_minutes, 0) AS available_minutes,
      COALESCE(b.booked_minutes, 0) AS booked_minutes,
      CASE WHEN COALESCE(c.available_minutes, 0) > 0
        THEN ROUND(COALESCE(b.booked_minutes, 0)::NUMERIC / c.available_minutes * 100, 1)
        ELSE 0 END AS occupancy_pct
    FROM teachers t
    LEFT JOIN teacher_capacity c ON c.teacher_id = t.id
    LEFT JOIN teacher_booked b ON b.teacher_id = t.id
    WHERE t.is_deleted = false
  ),
  prime_time_capacity AS (
    SELECT COALESCE(SUM(
      LEAST(end_minute, v_prime_end) - GREATEST(start_minute, v_prime_start)
    ), 0) AS prime_available_minutes
    FROM v_teacher_availability_unified
    WHERE end_minute > v_prime_start AND start_minute < v_prime_end
  ),
  prime_time_booked AS (
    SELECT COALESCE(SUM(
      LEAST(start_minute + duration_minutes, v_prime_end) - GREATEST(start_minute, v_prime_start)
    ), 0) AS prime_booked_minutes
    FROM lessons
    WHERE lifecycle_status IN ('trial', 'active')
      AND start_minute + duration_minutes > v_prime_start
      AND start_minute < v_prime_end
  ),
  overall AS (
    SELECT
      COALESCE(SUM(available_minutes), 0) AS total_available_minutes,
      COALESCE(SUM(booked_minutes), 0) AS total_booked_minutes
    FROM teacher_stats
  ),
  paused_schedulable AS (
    SELECT COUNT(*) AS cnt
    FROM students s
    WHERE s.status = 'paused' AND s.is_deleted = false
      AND EXISTS (
        SELECT 1
        FROM v_teacher_availability_unified av
        JOIN teachers t ON t.id = av.teacher_id AND t.is_deleted = false
        WHERE (
          s.course_id IS NULL
          OR EXISTS (SELECT 1 FROM courses c WHERE c.id = s.course_id AND c.category = ANY(t.specializations))
        )
        AND NOT EXISTS (
          SELECT 1 FROM lessons l
          WHERE l.teacher_id = av.teacher_id
            AND l.day_of_week = av.day_of_week
            AND l.lifecycle_status IN ('trial', 'active')
            AND l.time_range && int4range(av.start_minute, av.end_minute)
        )
      )
  )
  SELECT jsonb_build_object(
    'teacher_occupancy_rate', (
      SELECT CASE WHEN total_available_minutes > 0
        THEN ROUND(total_booked_minutes::NUMERIC / total_available_minutes * 100, 1)
        ELSE 0 END
      FROM overall
    ),
    'total_empty_hours', (
      SELECT ROUND(GREATEST(total_available_minutes - total_booked_minutes, 0) / 60.0, 1)
      FROM overall
    ),
    'unused_prime_time_hours', (
      SELECT ROUND(GREATEST(pc.prime_available_minutes - pb.prime_booked_minutes, 0) / 60.0, 1)
      FROM prime_time_capacity pc, prime_time_booked pb
    ),
    'prime_time_occupancy_pct', (
      SELECT CASE WHEN pc.prime_available_minutes > 0
        THEN ROUND(pb.prime_booked_minutes::NUMERIC / pc.prime_available_minutes * 100, 1)
        ELSE 0 END
      FROM prime_time_capacity pc, prime_time_booked pb
    ),
    'most_occupied_teacher', (
      SELECT jsonb_build_object('teacher_id', teacher_id, 'full_name', full_name, 'occupancy_pct', occupancy_pct)
      FROM teacher_stats WHERE available_minutes > 0 ORDER BY occupancy_pct DESC LIMIT 1
    ),
    'least_utilized_teacher', (
      SELECT jsonb_build_object('teacher_id', teacher_id, 'full_name', full_name, 'occupancy_pct', occupancy_pct)
      FROM teacher_stats WHERE available_minutes > 0 ORDER BY occupancy_pct ASC LIMIT 1
    ),
    'total_available_bookable_slots', (
      SELECT FLOOR(GREATEST(total_available_minutes - total_booked_minutes, 0) / 30.0)
      FROM overall
    ),
    'teachers_above_95pct_count', (
      SELECT COUNT(*) FROM teacher_stats WHERE available_minutes > 0 AND occupancy_pct > 95
    ),
    'teachers_below_40pct_count', (
      SELECT COUNT(*) FROM teacher_stats WHERE available_minutes > 0 AND occupancy_pct < 40
    ),
    'paused_students_schedulable_count', (SELECT cnt FROM paused_schedulable)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

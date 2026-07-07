-- ============================================================
-- Migration 009: Scheduling Engine — Schedule Health Metrics
--
-- Run this in: Supabase Dashboard → SQL Editor → Run
--
-- Phase 3 (Master Schedule Workspace). One aggregate function so the
-- Health Panel and the Master Grid never re-derive these numbers
-- independently. Computed over the recurring model (all active/trial
-- lessons across every day_of_week, weighed against
-- v_teacher_availability_unified capacity) — not tied to a specific
-- calendar week's exceptions yet; a deliberate V1 simplification
-- documented in the implementation plan.
--
-- Safe to re-run (CREATE OR REPLACE).
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
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

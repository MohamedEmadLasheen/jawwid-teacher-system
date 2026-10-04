-- ============================================================
-- Verification for migration 021. READ-ONLY — run any time.
-- Every query below states the expected result inline.
-- ============================================================

-- A + B: effective window per scoped teacher, read from the exact view
-- the schedule grid itself queries (v_teacher_availability_unified).
-- EXPECT: 8 teachers at 14:00-19:00 and 5 at 14:00-18:00, 7 days each,
--         source = 'shift', 91 rows total.
SELECT t.full_name, t.teacher_type,
       to_char((v.start_minute || ' minutes')::interval, 'HH24:MI') AS starts,
       to_char((v.end_minute   || ' minutes')::interval, 'HH24:MI') AS ends,
       count(*)                      AS day_rows,
       array_agg(v.day_of_week ORDER BY v.day_of_week) AS days,
       min(v.source)                 AS source
FROM v_teacher_availability_unified v
JOIN teachers t ON t.id = v.teacher_id
GROUP BY t.full_name, t.teacher_type, v.start_minute, v.end_minute
ORDER BY v.end_minute DESC, t.full_name;

-- L (no duplicates) + C (no over-reach): any teacher whose availability
-- is not exactly one consistent window per day.
-- EXPECT: ZERO rows.
SELECT t.full_name,
       count(*)                      AS rows_total,
       count(DISTINCT v.day_of_week) AS distinct_days,
       min(v.start_minute) AS min_start, max(v.start_minute) AS max_start,
       min(v.end_minute)   AS min_end,   max(v.end_minute)   AS max_end
FROM v_teacher_availability_unified v
JOIN teachers t ON t.id = v.teacher_id
GROUP BY t.full_name
HAVING count(*) <> count(DISTINCT v.day_of_week)
    OR min(v.start_minute) <> max(v.start_minute)
    OR min(v.end_minute)   <> max(v.end_minute);

-- C: exactly which teachers now have availability, and nobody else.
-- EXPECT: 13 rows — the 8 shift + 5 part-time teachers, no others.
--         ('Ghada ' and 'Hend Mohammed (اعاجم) ' must NOT appear.)
SELECT count(DISTINCT teacher_id) AS teachers_with_availability
FROM v_teacher_availability_unified;

SELECT DISTINCT t.id, t.full_name, t.teacher_type
FROM v_teacher_availability_unified v
JOIN teachers t ON t.id = v.teacher_id
ORDER BY t.full_name;

-- Templates: EXPECT exactly 2 rows, 840-1140 and 840-1080, both active.
SELECT name, start_minute, end_minute, timezone, is_active,
       (SELECT count(*) FROM teacher_shift_assignments a
         WHERE a.shift_template_id = s.id AND a.is_active) AS active_assignments
FROM shift_templates s ORDER BY end_minute DESC;

-- M (existing lessons intact): lesson totals must be unchanged by this
-- migration — it never touches the lessons table.
-- EXPECT: live_lessons = 1197, all_lessons = 1201 (as measured pre-migration).
SELECT count(*) FILTER (WHERE lifecycle_status IN ('trial','active')) AS live_lessons,
       count(*)                                                       AS all_lessons,
       count(DISTINCT teacher_id)                                     AS teachers_with_lessons
FROM lessons;

-- E (outside-shift is not capacity): per scoped teacher, how much of
-- their booked time falls OUTSIDE the new window. Non-zero means real
-- lessons sit outside the stated shift — not a bug in the grid, but
-- worth knowing: the grid will draw those lessons over hatched
-- out-of-shift background.
SELECT t.full_name,
       to_char((w.start_minute||' minutes')::interval,'HH24:MI') || '-' ||
       to_char((w.end_minute  ||' minutes')::interval,'HH24:MI') AS window,
       count(l.id)                                            AS lessons_outside_window,
       count(l.id) FILTER (WHERE l.start_minute < w.start_minute) AS before_shift,
       count(l.id) FILTER (WHERE l.start_minute + l.duration_minutes > w.end_minute) AS after_shift
FROM (SELECT DISTINCT teacher_id, start_minute, end_minute
        FROM v_teacher_availability_unified) w
JOIN teachers t ON t.id = w.teacher_id
LEFT JOIN lessons l
       ON l.teacher_id = w.teacher_id
      AND l.lifecycle_status IN ('trial','active')
      AND (l.start_minute < w.start_minute
           OR l.start_minute + l.duration_minutes > w.end_minute)
GROUP BY t.full_name, w.start_minute, w.end_minute
ORDER BY lessons_outside_window DESC, t.full_name;

-- Audit helper must be gone.
-- EXPECT: ZERO rows.
SELECT proname FROM pg_proc WHERE proname = 'normalize_ar_name';

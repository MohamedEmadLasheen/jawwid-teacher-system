-- ============================================================
-- Verification for 022. READ-ONLY — safe to run any time.
-- Each query states its expected result inline.
-- ============================================================

-- 1. Roster grouped by template, exactly as the Schedule UI reads it.
-- EXPECT: 'Full-time' 12:00-19:00 with 8 teachers, 'Part-time'
--         14:00-18:00 with 6 teachers. 14 total.
SELECT s.name                                                          AS group_name,
       to_char((s.start_minute||' minutes')::interval,'HH24:MI')||'-'||
       to_char((s.end_minute  ||' minutes')::interval,'HH24:MI')       AS window,
       s.start_minute, s.end_minute,
       count(DISTINCT a.teacher_id)                                    AS teachers
FROM shift_templates s
LEFT JOIN teacher_shift_assignments a ON a.shift_template_id = s.id AND a.is_active
WHERE s.is_active
GROUP BY s.name, s.start_minute, s.end_minute
ORDER BY s.start_minute, s.end_minute DESC;

-- 2. Every rostered teacher with name, id, group and window.
-- EXPECT: exactly 14 rows; no 'Fatma English', 'Basant', 'Rehab',
--         'Dina', and no 'Hend Mohammed (اعاجم)'.
SELECT t.full_name, t.id, t.teacher_type, s.name AS group_name,
       to_char((v.start_minute||' minutes')::interval,'HH24:MI')||'-'||
       to_char((v.end_minute  ||' minutes')::interval,'HH24:MI')       AS window,
       count(DISTINCT v.day_of_week)                                   AS days
FROM v_teacher_availability_unified v
JOIN teachers t ON t.id = v.teacher_id
JOIN teacher_shift_assignments a
  ON a.teacher_id = v.teacher_id AND a.day_of_week = v.day_of_week AND a.is_active
JOIN shift_templates s ON s.id = a.shift_template_id
GROUP BY t.full_name, t.id, t.teacher_type, s.name, v.start_minute, v.end_minute
ORDER BY v.start_minute, t.full_name;

-- 3. Counts. EXPECT roster_size 14, full_time 8, part_time 6,
--    active_assignments 98 (14 x 7 days), duplicates 0.
SELECT (SELECT count(DISTINCT teacher_id) FROM v_teacher_availability_unified)          AS roster_size,
       (SELECT count(DISTINCT a.teacher_id) FROM teacher_shift_assignments a
          JOIN shift_templates s ON s.id = a.shift_template_id
         WHERE a.is_active AND s.name = 'Full-time')                                    AS full_time,
       (SELECT count(DISTINCT a.teacher_id) FROM teacher_shift_assignments a
          JOIN shift_templates s ON s.id = a.shift_template_id
         WHERE a.is_active AND s.name = 'Part-time')                                    AS part_time,
       (SELECT count(*) FROM teacher_shift_assignments WHERE is_active)                 AS active_assignments,
       (SELECT count(*) FROM (SELECT teacher_id, day_of_week
                                FROM v_teacher_availability_unified
                               GROUP BY 1,2 HAVING count(*) > 1) z)                     AS duplicate_windows;

-- 4. Excluded / unrelated teachers must NOT be in the roster.
-- EXPECT: zero rows.
SELECT t.id, t.full_name, 'UNEXPECTEDLY IN ROSTER' AS problem
FROM teachers t
WHERE t.id IN (SELECT DISTINCT teacher_id FROM v_teacher_availability_unified)
  AND (t.id = 'b9802a91-b3cc-444a-9150-5d7b3d431504'
       OR lower(t.full_name) LIKE 'fatma%' OR lower(t.full_name) LIKE 'basant%'
       OR lower(t.full_name) LIKE 'rehab%' OR lower(t.full_name) LIKE 'dina%');

-- 5. The excluded duplicate Hend record must be untouched.
-- EXPECT: teacher_type 'hourly', 0 assignment rows, 0 view rows.
SELECT t.full_name, t.teacher_type,
       (SELECT count(*) FROM teacher_shift_assignments a WHERE a.teacher_id = t.id)      AS assignment_rows,
       (SELECT count(*) FROM v_teacher_availability_unified v WHERE v.teacher_id = t.id) AS view_rows
FROM teachers t WHERE t.id = 'b9802a91-b3cc-444a-9150-5d7b3d431504';

-- 6. Lesson data must be byte-for-byte untouched by this migration.
-- EXPECT: 1197 live, 1201 all, 1482 participants, 5 exceptions,
--         47820 total duration minutes (pre-022 baseline).
SELECT count(*) FILTER (WHERE lifecycle_status IN ('trial','active'))  AS lessons_live,
       count(*)                                                        AS lessons_all,
       sum(duration_minutes)                                           AS total_duration_minutes,
       (SELECT count(*) FROM lesson_participants)                      AS participants,
       (SELECT count(*) FROM lesson_exceptions)                        AS lesson_exceptions
FROM lessons;

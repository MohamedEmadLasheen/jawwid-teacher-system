-- ============================================================
-- Verification for 023. READ-ONLY — safe to run any time.
-- Each query states its expected result inline.
-- ============================================================

-- 1. The Admin legend, exactly as the UI builds it (active supervisors
--    that have a colour), with how many students each one owns.
-- EXPECT: exactly 4 rows — Dina #E06666, Zainab #F9CB9C,
--         Rehab #C9DAF8, Asmaa #93C47D. No 'Basant'.
SELECT s.name,
       s.color_hex,
       s.status,
       count(st.id) AS active_students
FROM supervisors s
LEFT JOIN students st ON st.supervisor_id = s.id AND NOT st.is_deleted
WHERE s.status = 'active' AND s.color_hex IS NOT NULL
GROUP BY s.name, s.color_hex, s.status
ORDER BY s.name;

-- 2. No duplicate Admin records. EXPECT: zero rows.
SELECT name, count(*) AS copies
FROM supervisors
WHERE name IN ('Dina', 'Zainab', 'Rehab', 'Asmaa', 'Basant')
GROUP BY name
HAVING count(*) > 1;

-- 3. Referential integrity of ownership. EXPECT: zero rows.
SELECT st.id, st.full_name, st.supervisor_id, 'ORPHANED OWNERSHIP' AS problem
FROM students st
WHERE st.supervisor_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM supervisors s WHERE s.id = st.supervisor_id);

-- 4. The colour is never duplicated onto the student row.
-- EXPECT: zero rows (students has no colour column at all).
SELECT column_name, 'COLOUR DUPLICATED ONTO STUDENT' AS problem
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'students'
  AND (column_name LIKE '%color%' OR column_name LIKE '%colour%');

-- 5. Ownership coverage. `unassigned` is the legacy backlog: it must
--    never grow, because the application requires an Admin on create.
-- EXPECT: total = assigned + unassigned; unassigned only ever shrinks.
SELECT count(*)                                            AS total_active_students,
       count(supervisor_id)                                AS assigned,
       count(*) - count(supervisor_id)                     AS unassigned,
       round(100.0 * count(supervisor_id) / greatest(count(*), 1), 1) AS assigned_pct
FROM students
WHERE NOT is_deleted;

-- 6. The legacy unassigned students, by name — the worklist for the
--    "Unassigned" filter on the Students page.
-- EXPECT: whatever 5 reported as `unassigned`; each one is a real
--         record that must be assigned by a human, never by a script.
SELECT id, full_name, status, created_at
FROM students
WHERE supervisor_id IS NULL AND NOT is_deleted
ORDER BY created_at DESC
LIMIT 50;

-- 7. The schema guarantees the relationship. EXPECT: one FK row
--    (students.supervisor_id -> supervisors.id) and the index.
SELECT c.conname, pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
JOIN pg_class child  ON child.oid  = c.conrelid
JOIN pg_class parent ON parent.oid = c.confrelid
WHERE c.contype = 'f' AND child.relname = 'students' AND parent.relname = 'supervisors';

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'students' AND indexdef LIKE '%supervisor_id%';

-- 8. RLS unchanged — the two-tier model from 003/005.
-- EXPECT: students/supervisors each with select/insert/update on
--         authenticated and delete on is_admin_level(). No policy
--         granting broad write access to anything else.
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('students', 'supervisors')
ORDER BY tablename, cmd, policyname;

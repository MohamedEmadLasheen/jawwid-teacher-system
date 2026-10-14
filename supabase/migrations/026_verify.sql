-- ============================================================
-- Verification for 026. READ-ONLY — safe to run any time.
-- Each query states its expected result inline.
-- ============================================================

-- 1. The table exists with exactly the four membership columns.
-- EXPECT: 4 rows — added_at timestamptz NO | added_by uuid YES | source text NO | teacher_id uuid NO
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'schedule_hourly_roster'
ORDER BY column_name;

-- 2. No time or availability column: membership only.
-- EXPECT: 0
SELECT count(*) FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'schedule_hourly_roster'
  AND column_name ~ '(minute|time|hour|day|window|shift)';

-- 3. RLS on, three policies (select authenticated; insert/delete admin-level).
-- EXPECT: t | 3
SELECT c.relrowsecurity, (SELECT count(*) FROM pg_policies WHERE tablename = 'schedule_hourly_roster')
FROM pg_class c WHERE c.oid = 'public.schedule_hourly_roster'::regclass;

-- 3b. The three policies, exactly.
-- EXPECT: 3 rows —
--   schedule_hourly_roster_delete | DELETE | (USING) is_admin_level() | (no check)
--   schedule_hourly_roster_insert | INSERT | (no using)               | is_admin_level()
--   schedule_hourly_roster_select | SELECT | (auth.role() = 'authenticated'::text) | (no check)
SELECT policyname, cmd, coalesce(qual, '(no using)'), coalesce(with_check, '(no check)')
FROM pg_policies WHERE schemaname = 'public' AND tablename = 'schedule_hourly_roster' ORDER BY policyname;

-- 4. Privileges: anon none; authenticated exactly SELECT, INSERT, DELETE.
-- EXPECT: anon f f f f f | authenticated t t t f f   (select insert delete update truncate)
SELECT r, has_table_privilege(r, 'public.schedule_hourly_roster', 'SELECT'),
          has_table_privilege(r, 'public.schedule_hourly_roster', 'INSERT'),
          has_table_privilege(r, 'public.schedule_hourly_roster', 'DELETE'),
          has_table_privilege(r, 'public.schedule_hourly_roster', 'UPDATE'),
          has_table_privilege(r, 'public.schedule_hourly_roster', 'TRUNCATE')
FROM unnest(ARRAY['anon', 'authenticated']) AS r ORDER BY r;

-- 5. No member is a shift-roster teacher, and none is soft-deleted.
-- EXPECT: 0 | 0
SELECT
  (SELECT count(*) FROM public.schedule_hourly_roster r
    WHERE EXISTS (SELECT 1 FROM public.teacher_shift_assignments a JOIN public.shift_templates s ON s.id = a.shift_template_id
                  WHERE a.teacher_id = r.teacher_id AND a.is_active AND s.is_active)),
  (SELECT count(*) FROM public.schedule_hourly_roster r JOIN public.teachers t ON t.id = r.teacher_id WHERE t.is_deleted);

-- 6. 026 created nothing else: the only object depending on the table is its own pkey/fkeys.
-- EXPECT: schedule_hourly_roster_pkey, schedule_hourly_roster_teacher_id_fkey, schedule_hourly_roster_added_by_fkey
SELECT conname FROM pg_constraint WHERE conrelid = 'public.schedule_hourly_roster'::regclass ORDER BY conname;

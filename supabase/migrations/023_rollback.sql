-- ============================================================
-- Rollback for 023. Run in: Supabase Dashboard → SQL Editor.
--
-- 023 added no table, no column and no policy, so there is almost
-- nothing to reverse. It reverses the two things it did change:
--
--   1. the COMMENT on students.supervisor_id,
--   2. the 'Basant' → 'Asmaa' rename (id preserved, so every student
--      assignment survives the round trip untouched).
--
-- The canonical colour values are NOT reverted: they are the colours
-- the live schedule already used before 023 (migration 006), so
-- "reverting" them would be a change, not a rollback.
--
-- No students row is read for writing, inserted, updated or deleted.
-- ============================================================

BEGIN;

COMMENT ON COLUMN students.supervisor_id IS NULL;

DO $$
DECLARE
  v_id    UUID;
  v_count INT;
BEGIN
  IF EXISTS (SELECT 1 FROM supervisors WHERE name = 'Asmaa')
     AND NOT EXISTS (SELECT 1 FROM supervisors WHERE name = 'Basant') THEN
    UPDATE supervisors SET name = 'Basant' WHERE name = 'Asmaa'
    RETURNING id INTO v_id;
    SELECT count(*) INTO v_count FROM students WHERE supervisor_id = v_id AND NOT is_deleted;
    RAISE NOTICE 'Reverted supervisor Asmaa -> Basant (id %), % assigned student(s) preserved.', v_id, v_count;
  ELSE
    RAISE NOTICE 'Nothing to revert: no unambiguous Asmaa -> Basant rename available.';
  END IF;
END $$;

COMMIT;

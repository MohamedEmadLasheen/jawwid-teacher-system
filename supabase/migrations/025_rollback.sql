-- Rollback for 025_lesson_source_provenance.sql — FOR NON-PRODUCTION ENVIRONMENTS ONLY.
--
-- In production these objects predate 025 (they were applied out-of-band with
-- the 2026-10-06 import) and protect the provenance of imported lessons;
-- removing them there would not undo 025, it would delete pre-existing
-- protection. Refuses to run while any lesson carries provenance.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.lessons WHERE source_sheet IS NOT NULL) THEN
    RAISE EXCEPTION '025 rollback refused: lessons carry provenance; this would strip it';
  END IF;
END $$;
DROP TRIGGER IF EXISTS trg_lessons_provenance_immutable ON public.lessons;
DROP FUNCTION IF EXISTS public.lessons_provenance_is_immutable();
DROP INDEX IF EXISTS public.lessons_source_provenance_uniq;
ALTER TABLE public.lessons DROP CONSTRAINT IF EXISTS lessons_provenance_pair_chk;
ALTER TABLE public.lessons DROP COLUMN IF EXISTS source_cell;
ALTER TABLE public.lessons DROP COLUMN IF EXISTS source_sheet;
COMMIT;

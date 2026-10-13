-- =============================================================================
-- 025 — Lesson source provenance (documents objects already in production)
-- =============================================================================
--
-- WHY THIS FILE EXISTS
-- The production database already carries lesson provenance that no migration
-- in this repository created. It was applied out-of-band together with the
-- 2026-10-06 schedule import (inspected 2026-10-13):
--
--   lessons.source_sheet text, lessons.source_cell text
--   lessons_provenance_pair_chk       both set (non-empty) or both NULL
--   lessons_source_provenance_uniq    UNIQUE (source_sheet, source_cell) WHERE source_sheet IS NOT NULL
--   lessons_provenance_is_immutable() + trg_lessons_provenance_immutable
--                                     once set, provenance can never change
--
-- The grid schedule importer (scripts/import-schedule/grid) depends on these
-- objects for idempotency: every lesson it writes carries
--   source_sheet = the workbook sheet name, source_cell = '<cell>@<workbook sha256[:12]>'
-- and the unique index makes a second insert of the same source cell from the
-- same workbook impossible. The workbook fingerprint in the key is what keeps
-- the 2026-10-06 rows (bare cell references from an older sheet layout)
-- distinct from rows imported from a later workbook version.
--
-- This migration recreates the objects exactly as deployed so that every
-- environment built from this repository matches production. It is written to
-- be a NO-OP where they already exist (production): ADD COLUMN IF NOT EXISTS,
-- guarded constraint/trigger creation, CREATE INDEX IF NOT EXISTS, and a
-- CREATE OR REPLACE of the identical function body.
--
-- Additive and backward compatible: nullable columns, no data change, no
-- effect on rows without provenance. Rollback: 025_rollback.sql (do not run it
-- against production — it would remove protection the 2026-10-06 rows rely on).
-- =============================================================================

BEGIN;

ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS source_sheet text;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS source_cell text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.lessons'::regclass AND conname = 'lessons_provenance_pair_chk') THEN
    ALTER TABLE public.lessons ADD CONSTRAINT lessons_provenance_pair_chk CHECK (
      (source_sheet IS NULL AND source_cell IS NULL)
      OR (source_sheet IS NOT NULL AND source_cell IS NOT NULL
          AND length(source_sheet) > 0 AND length(source_cell) > 0));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS lessons_source_provenance_uniq
  ON public.lessons USING btree (source_sheet, source_cell) WHERE (source_sheet IS NOT NULL);

CREATE OR REPLACE FUNCTION public.lessons_provenance_is_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.source_sheet IS NOT NULL
     AND (NEW.source_sheet, NEW.source_cell) IS DISTINCT FROM (OLD.source_sheet, OLD.source_cell) THEN
    RAISE EXCEPTION 'lesson provenance is immutable: % % cannot become % %',
      OLD.source_sheet, OLD.source_cell, NEW.source_sheet, NEW.source_cell
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.lessons'::regclass AND tgname = 'trg_lessons_provenance_immutable'
                    AND NOT tgisinternal) THEN
    CREATE TRIGGER trg_lessons_provenance_immutable
      BEFORE UPDATE ON public.lessons
      FOR EACH ROW EXECUTE FUNCTION public.lessons_provenance_is_immutable();
  END IF;
END $$;

COMMIT;

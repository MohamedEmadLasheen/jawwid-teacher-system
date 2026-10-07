-- ============================================================
-- Migration 024: Teacher Evaluation — 9 criteria, per-criterion
--                comments, and a general comment.
--
-- Run this in: Supabase Dashboard → SQL Editor → Run
--
-- ONE new column. No table is created, no column is dropped, no
-- column changes type or nullability, no policy changes, and not one
-- session_evaluations row is inserted, updated or deleted.
--
-- WHAT THIS FEATURE NEEDED
-- --------------------------------------------------------------
--   * nine named criteria, each with its own score,
--   * an OPTIONAL comment belonging to EACH criterion
--     individually, and
--   * one optional comment about the evaluation as a whole.
--
-- WHAT ALREADY EXISTED, AND IS REUSED AS-IS
-- --------------------------------------------------------------
-- `session_evaluations.custom_note` (migration 001) is already the
-- whole-evaluation comment: one TEXT field, written by the
-- evaluation form's "Comments Library", persisted since day one. The
-- General Comment requirement is therefore satisfied by REUSING this
-- column — not by adding a second one that would mean the same
-- thing. Its meaning is documented below so the contract is readable
-- from the schema itself.
--
-- WHY JSONB RATHER THAN 18 NEW COLUMNS
-- --------------------------------------------------------------
-- The existing 16 criterion columns (tajweed_accuracy … follow_up)
-- are a fixed-column design. Extending it for this feature would
-- mean nine more score columns PLUS nine more comment columns, and
-- the pairing between a score and "its" comment would exist only as
-- a naming convention — exactly the structure in which one
-- criterion's comment can be written into another criterion's field.
--
-- One JSONB column makes that pairing structural: the comment is
-- INSIDE the criterion it belongs to and cannot be reached except
-- through it.
--
--     criteria = {
--       "cameraAppearanceLighting": { "score": "good",      "comment": "" },
--       "studentEngagement":        { "score": "excellent", "comment": "Engaged for most of the lesson, attention dropped in the final 10 minutes." },
--       ...
--     }
--
-- The nine keys are defined in ONE place in the application —
-- src/features/action-center/evaluationCriteria.ts — which is also
-- what reads and writes this column. Keys are validated on read:
-- an unknown key is ignored and a missing key falls back to the
-- default rating, so a future criterion can be added without a
-- migration and without breaking a row written before it existed.
--
-- THE 16 LEGACY CRITERION COLUMNS ARE NOT TOUCHED
-- --------------------------------------------------------------
-- They keep their data, their type, their NOT NULL and their
-- DEFAULT 'good'. Historical evaluations are therefore bit-for-bit
-- unchanged and remain readable by exactly the code that read them
-- before.
--
-- They are also deliberately NOT made nullable. Dropping NOT NULL
-- would be the tidier schema, but it would change the contract of a
-- live production table for no behavioural gain: nothing in the
-- application reads those columns (the Action Center list, the
-- teacher History tab, the risk engine and the dashboard all read
-- overall_score only). The cost of leaving them is that a NEW
-- evaluation, which does not score them, lets their DEFAULT 'good'
-- stand.
--
--     *** `criteria` IS THE DISCRIMINATOR. ***
--
--     criteria <> '{}'::jsonb   → a 9-criteria evaluation. The 16
--                                 legacy columns hold DEFAULTS, NOT
--                                 RATINGS, and MUST NOT be read as
--                                 scores or aggregated.
--     criteria =  '{}'::jsonb   → a historical evaluation. The 16
--                                 legacy columns are its real
--                                 ratings.
--
-- overall_score and grade stay the single cross-era measure: both
-- eras compute them on the same 4-level scale
-- (excellent/good/acceptable/needs_improvement → 4/3/2/1,
-- normalised to 0-100 with the same behavioural bonus and the same
-- 90/75/60/45 grade thresholds), so every existing average, badge
-- and risk calculation keeps working across the boundary with no
-- change at all.
--
-- NO RLS CHANGE. session_evaluations keeps the four-policy model
-- migration 003 installed verbatim: SELECT/INSERT/UPDATE for any
-- authenticated staff member, DELETE for public.is_admin_level()
-- only. A new column on an already-protected table inherits that
-- model and needs no new or broader policy.
--
-- Safe to re-run: ADD COLUMN IF NOT EXISTS, and every check is a
-- current-state check.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 0. Refuse to run against a schema this migration does not fit.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'session_evaluations'
  ) THEN
    RAISE EXCEPTION 'session_evaluations is missing — run migration 001 first.';
  END IF;

  -- The column the General Comment requirement is satisfied by
  -- REUSING. If it is absent, this environment is not the schema
  -- this feature was designed against and the reuse decision above
  -- no longer holds.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'session_evaluations'
      AND column_name = 'custom_note'
  ) THEN
    RAISE EXCEPTION
      'session_evaluations.custom_note is missing — run migration 001 first. '
      'The General Comment reuses this column and will not be added separately.';
  END IF;
END $$;

-- ------------------------------------------------------------
-- 1. The one new column.
--
-- NOT NULL DEFAULT '{}' so that:
--   * every historical row becomes '{}' WITHOUT being rewritten
--     (Postgres stores the default in the catalogue for an
--     ADD COLUMN ... DEFAULT; no table rewrite, no row touched), and
--   * reading code never has to handle SQL NULL on top of the
--     empty case. Exactly one representation of "this evaluation has
--     no 9-criteria data": the empty object.
-- ------------------------------------------------------------
ALTER TABLE session_evaluations
  ADD COLUMN IF NOT EXISTS criteria JSONB NOT NULL DEFAULT '{}'::jsonb;

-- An object, never a scalar or an array — the shape the application
-- parser assumes. NOT VALID is deliberate: it constrains every row
-- written from now on without scanning a production table, and the
-- pre-existing rows are all the catalogue default '{}', which
-- satisfies it anyway. Validate it later at leisure with
-- `ALTER TABLE session_evaluations VALIDATE CONSTRAINT
--  session_evaluations_criteria_is_object;`
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'session_evaluations_criteria_is_object'
      AND conrelid = 'public.session_evaluations'::regclass
  ) THEN
    ALTER TABLE session_evaluations
      ADD CONSTRAINT session_evaluations_criteria_is_object
      CHECK (jsonb_typeof(criteria) = 'object') NOT VALID;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. Document both halves of the comment contract on the columns
--    themselves, so "which comment is which" is answerable from
--    the schema without reading the application.
-- ------------------------------------------------------------
COMMENT ON COLUMN session_evaluations.criteria IS
  'The nine evaluation criteria, each carrying its OWN optional comment: '
  '{"<criterionKey>": {"score": "excellent|good|acceptable|needs_improvement", '
  '"comment": "<free text, may be empty>"}}. A comment here is a '
  'PER-CRITERION comment and belongs to the criterion that contains it — it '
  'is never a comment about the evaluation as a whole (see custom_note). '
  'Criterion keys are defined in exactly one place: '
  'src/features/action-center/evaluationCriteria.ts. Unknown keys are ignored '
  'on read and missing keys fall back to the default rating, so a criterion '
  'may be added without a migration. '
  'DISCRIMINATOR: criteria <> ''{}'' means a 9-criteria evaluation, whose 16 '
  'legacy criterion columns (tajweed_accuracy .. follow_up) hold DEFAULTS and '
  'MUST NOT be read as ratings. criteria = ''{}'' means a historical '
  'evaluation, whose legacy columns ARE its ratings.';

COMMENT ON COLUMN session_evaluations.custom_note IS
  'GENERAL COMMENT — free text about the lesson/evaluation AS A WHOLE. '
  'Distinct from the per-criterion comments in `criteria`, which each belong '
  'to one specific criterion. Optional; empty string when not given. '
  'Present since migration 001 and REUSED unchanged for this purpose, which '
  'is why no second general-comment column exists. Rendered under the '
  'teacher''s name in the Action Center evaluation list.';

-- ------------------------------------------------------------
-- 3. Report the current state. Read-only.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_total  INT;
  v_legacy INT;
  v_new    INT;
  v_notes  INT;
BEGIN
  SELECT count(*),
         count(*) FILTER (WHERE criteria =  '{}'::jsonb),
         count(*) FILTER (WHERE criteria <> '{}'::jsonb),
         count(*) FILTER (WHERE coalesce(custom_note, '') <> '')
    INTO v_total, v_legacy, v_new, v_notes
  FROM session_evaluations;

  RAISE NOTICE 'session_evaluations: % row(s) total.', v_total;
  RAISE NOTICE '  % historical evaluation(s) (criteria = ''{}'') — untouched, still read from the 16 legacy columns.', v_legacy;
  RAISE NOTICE '  % 9-criteria evaluation(s) (criteria <> ''{}'').', v_new;
  RAISE NOTICE '  % evaluation(s) already carry a general comment in custom_note — none was created, altered or cleared here.', v_notes;
END $$;

COMMIT;

-- ============================================================
-- Rollback for 024. Run in: Supabase Dashboard → SQL Editor.
--
-- 024 added one column and two COMMENTs. This reverses exactly
-- those, and nothing else.
--
-- *** READ THIS BEFORE RUNNING ***
--
-- Dropping `criteria` DESTROYS the nine criterion scores and every
-- per-criterion comment of every evaluation created since 024 was
-- applied. That data exists nowhere else — the 16 legacy columns
-- hold defaults for those rows, not ratings.
--
-- What SURVIVES the rollback for those evaluations:
--   * the row itself, its teacher, evaluator and session date,
--   * overall_score and grade (ordinary columns, never dropped), so
--     every average, badge and risk calculation keeps working,
--   * the GENERAL COMMENT — custom_note is a migration-001 column
--     that 024 only documented, so it is not dropped here.
--
-- What is LOST: the nine per-criterion scores and the nine
-- per-criterion comments.
--
-- So: run step 1 first and keep its output. It writes nothing.
-- ============================================================

-- ------------------------------------------------------------
-- 1. BACKUP / IMPACT CHECK — read-only. Run this FIRST.
--    Any row listed here loses its criteria data in step 2.
-- ------------------------------------------------------------
SELECT count(*) AS evaluations_that_would_lose_criteria
FROM session_evaluations
WHERE criteria <> '{}'::jsonb;

-- The data itself, so it can be copied out before the drop.
SELECT id, teacher_id, session_date, overall_score, grade,
       custom_note AS general_comment,
       jsonb_pretty(criteria) AS criteria
FROM session_evaluations
WHERE criteria <> '{}'::jsonb
ORDER BY created_at DESC;

-- ------------------------------------------------------------
-- 2. THE ROLLBACK. Uncomment to run, once step 1 is saved.
-- ------------------------------------------------------------
-- BEGIN;
--
-- -- Refuse to silently destroy data: this aborts if any evaluation
-- -- still holds criteria. Comment out the RAISE only when the loss
-- -- is intended and step 1's output has been kept.
-- DO $$
-- DECLARE
--   v_at_risk INT;
-- BEGIN
--   SELECT count(*) INTO v_at_risk
--   FROM session_evaluations WHERE criteria <> '{}'::jsonb;
--
--   IF v_at_risk > 0 THEN
--     RAISE EXCEPTION
--       '% evaluation(s) hold 9-criteria data that dropping this column would '
--       'destroy. Save the output of step 1, then remove this guard to proceed.',
--       v_at_risk;
--   END IF;
-- END $$;
--
-- ALTER TABLE session_evaluations
--   DROP CONSTRAINT IF EXISTS session_evaluations_criteria_is_object;
--
-- ALTER TABLE session_evaluations DROP COLUMN IF EXISTS criteria;
--
-- -- The documentation 024 added. The COLUMN itself predates 024 and
-- -- is NOT dropped — only the comment 024 wrote on it is removed.
-- COMMENT ON COLUMN session_evaluations.custom_note IS NULL;
--
-- COMMIT;

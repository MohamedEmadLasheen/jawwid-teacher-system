-- ============================================================
-- Verification for 024. READ-ONLY — safe to run any time.
-- Each query states its expected result inline.
-- ============================================================

-- 1. The one new column exists, with the shape reading code assumes.
-- EXPECT: exactly one row — criteria | jsonb | NO | '{}'::jsonb
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'session_evaluations'
  AND column_name = 'criteria';

-- 2. The 16 legacy criterion columns are UNCHANGED by 024: still
--    text, still NOT NULL, still DEFAULT 'good'.
-- EXPECT: 16 rows, every one  text | NO | 'good'::text
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'session_evaluations'
  AND column_name IN (
    'tajweed_accuracy', 'pronunciation', 'correction_quality', 'listening_skills',
    'punctuality', 'time_management', 'student_engagement', 'class_flow',
    'professionalism', 'clarity', 'encouragement', 'parent_communication',
    'lesson_preparation', 'explanation_quality', 'error_correction', 'follow_up'
  )
ORDER BY column_name;

-- 3. NO second general-comment column was added: custom_note is
--    still the only whole-evaluation comment field.
-- EXPECT: exactly one row — custom_note. No 'general_comment',
--         'general_note' or similar.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'session_evaluations'
  AND (column_name LIKE '%note%' OR column_name LIKE '%comment%')
  AND column_name <> 'criteria'
ORDER BY column_name;

-- 4. Both halves of the comment contract are documented on the
--    columns themselves.
-- EXPECT: 2 rows, both with a non-empty comment — criteria
--         ("PER-CRITERION") and custom_note ("GENERAL COMMENT").
SELECT a.attname AS column_name,
       col_description(a.attrelid, a.attnum) AS column_comment
FROM pg_attribute a
WHERE a.attrelid = 'public.session_evaluations'::regclass
  AND a.attname IN ('criteria', 'custom_note')
ORDER BY a.attname;

-- 5. NO EXISTING EVALUATION WAS LOST OR REWRITTEN.
--    Every pre-024 row must still be present and must read as a
--    historical evaluation (criteria = '{}'), with its original
--    score intact.
-- EXPECT: historical = every row that existed before 024 ran;
--         zero rows with a NULL criteria (the column is NOT NULL).
SELECT count(*)                                              AS total_evaluations,
       count(*) FILTER (WHERE criteria =  '{}'::jsonb)        AS historical_untouched,
       count(*) FILTER (WHERE criteria <> '{}'::jsonb)        AS nine_criteria_evaluations,
       count(*) FILTER (WHERE criteria IS NULL)               AS must_be_zero_null_criteria,
       min(created_at)                                        AS oldest_evaluation,
       max(created_at)                                        AS newest_evaluation
FROM session_evaluations;

-- 6. Historical evaluations keep their ORIGINAL scores and their
--    original legacy ratings — nothing was defaulted over.
-- EXPECT: a sample of pre-existing rows, each with its own
--         overall_score/grade and its real legacy ratings.
SELECT id, session_date, overall_score, grade,
       tajweed_accuracy, punctuality, student_engagement,
       coalesce(custom_note, '') AS general_comment,
       criteria
FROM session_evaluations
WHERE criteria = '{}'::jsonb
ORDER BY created_at DESC
LIMIT 10;

-- 7. Every 9-criteria evaluation is well formed: an object whose
--    entries each carry a score drawn from the existing 4-level
--    scale. `comment` is OPTIONAL by contract, so its absence is
--    not a fault — a missing/invalid SCORE is.
-- EXPECT: zero rows.
SELECT e.id, c.key AS criterion, c.value AS entry, 'MALFORMED CRITERION' AS problem
FROM session_evaluations e
CROSS JOIN LATERAL jsonb_each(e.criteria) c
WHERE e.criteria <> '{}'::jsonb
  AND (
    jsonb_typeof(c.value) <> 'object'
    OR c.value->>'score' IS NULL
    OR c.value->>'score' NOT IN ('excellent', 'good', 'acceptable', 'needs_improvement')
  );

-- 8. A per-criterion comment belongs to ONE criterion. This counts
--    the distinct comment texts per evaluation against the number of
--    commented criteria: it is a smoke test for a bug that wrote one
--    comment into every criterion.
-- EXPECT: for each row, commented_criteria = distinct_comments
--         (identical wording on two criteria is legitimate, so this
--         is a signal to read, not an assertion to fail on).
SELECT e.id,
       count(*)                      AS commented_criteria,
       count(DISTINCT c.value->>'comment') AS distinct_comments
FROM session_evaluations e
CROSS JOIN LATERAL jsonb_each(e.criteria) c
WHERE e.criteria <> '{}'::jsonb
  AND coalesce(c.value->>'comment', '') <> ''
GROUP BY e.id
ORDER BY e.id;

-- 9. The general comment is independent of the per-criterion ones:
--    an evaluation may have either, both or neither.
-- EXPECT: all four combinations are legal; none is an error.
SELECT (coalesce(custom_note, '') <> '')                      AS has_general_comment,
       (criteria::text LIKE '%"comment": "%')                 AS may_have_criterion_comments,
       count(*)                                               AS evaluations
FROM session_evaluations
GROUP BY 1, 2
ORDER BY 1, 2;

-- 10. Criterion coverage of the 9-criteria rows.
-- EXPECT: 9 keys, each appearing once per 9-criteria evaluation —
--         cameraAppearanceLighting, studentEngagement,
--         mistakeCorrectionQuality, interactiveEngagement,
--         recitationTajweed, fushaCommitment, punctuality,
--         halaqahManagement, explanationClarity.
SELECT c.key AS criterion,
       count(*) AS evaluations,
       count(*) FILTER (WHERE coalesce(c.value->>'comment', '') <> '') AS with_comment
FROM session_evaluations e
CROSS JOIN LATERAL jsonb_each(e.criteria) c
WHERE e.criteria <> '{}'::jsonb
GROUP BY c.key
ORDER BY c.key;

-- 11. RLS unchanged — the four-policy model from migration 003.
-- EXPECT: select/insert/update on authenticated, delete on
--         is_admin_level(). No new or broader policy.
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'session_evaluations'
ORDER BY cmd, policyname;

-- 12. No teacher record was touched by this feature.
-- EXPECT: every teacher referenced by an evaluation still resolves.
SELECT count(*) AS orphaned_evaluations
FROM session_evaluations e
WHERE NOT EXISTS (SELECT 1 FROM teachers t WHERE t.id = e.teacher_id);

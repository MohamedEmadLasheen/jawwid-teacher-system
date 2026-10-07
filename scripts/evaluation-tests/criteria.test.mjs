/**
 * THE TEACHER-EVALUATION CONTRACT, asserted against the real module.
 *
 * Covers the four things this feature promised and the one thing it promised
 * not to break:
 *
 *   1. nine criteria, in a fixed order, with the existing 4-level scale;
 *   2. a comment per criterion that CANNOT reach another criterion;
 *   3. a general comment that is a different field from all of them;
 *   4. the existing 0-100 score and grade thresholds, unchanged;
 *   5. a historical evaluation, which has none of the above, still reads.
 *
 * Runs on plain Node against the esbuild-bundled source — same mechanism as
 * scripts/schedule-geometry-tests. No test-runner dependency is added.
 */
import {
  EVALUATION_CRITERION_KEYS, RATING_OPTIONS, RATING_SCORE, DEFAULT_RATING,
  emptyCriteria, setCriterion, serializeCriteria, parseCriteria,
  computeEvaluationScore, gradeForScore, applyTemplate, EVALUATION_TEMPLATES,
  validateEvaluationDraft,
} from './evaluationCriteria.mjs';
import { matchesSearch } from './searchText.mjs';

let pass = 0, fail = 0;
const results = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}` +
    (ok ? '' : `\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`));
}

const line = (title) => { console.log('='.repeat(78)); console.log(title); console.log('='.repeat(78)); };

// ====================================================================== 1
line('1 · THE NINE CRITERIA');

check('exactly nine criteria', EVALUATION_CRITERION_KEYS.length, 9);
check('in the required order', [...EVALUATION_CRITERION_KEYS], [
  'cameraAppearanceLighting',       // 1. Camera, appearance, and lighting
  'studentEngagement',              // 2. Student engagement with the teacher
  'mistakeCorrectionQuality',       // 3. Quality of correcting the student's mistakes
  'interactiveEngagement',          // 4. Engaging the student with interactive methods
  'recitationTajweed',              // 5. Recitation and Tajweed
  'fushaCommitment',                // 6. Commitment to Fusha
  'punctuality',                    // 7. Punctuality
  'halaqahManagement',              // 8. Halaqah/class management
  'explanationClarity',             // 9. Explaining at the student's level
]);
check('no duplicate keys', new Set(EVALUATION_CRITERION_KEYS).size, 9);

// The scale is the one that already existed — this feature invented none.
check('the existing 4-level scale, unchanged',
  [...RATING_OPTIONS], ['excellent', 'good', 'acceptable', 'needs_improvement']);
check('the existing ordinal values, unchanged',
  RATING_SCORE, { excellent: 4, good: 3, acceptable: 2, needs_improvement: 1 });

const fresh = emptyCriteria();
check('a new evaluation holds all nine', Object.keys(fresh).length, 9);
check('every criterion starts at a real required score',
  EVALUATION_CRITERION_KEYS.every((k) => fresh[k].score === DEFAULT_RATING), true);
check('every criterion starts with no comment',
  EVALUATION_CRITERION_KEYS.every((k) => fresh[k].comment === ''), true);

// ====================================================================== 2
line('2 · SCORES PERSIST, PER CRITERION');

let scored = emptyCriteria();
scored = setCriterion(scored, 'punctuality', { score: 'needs_improvement' });
scored = setCriterion(scored, 'recitationTajweed', { score: 'excellent' });

check('a score lands on the criterion it was set on',
  [scored.punctuality.score, scored.recitationTajweed.score],
  ['needs_improvement', 'excellent']);
check('setting one score leaves the other eight alone',
  EVALUATION_CRITERION_KEYS
    .filter((k) => k !== 'punctuality' && k !== 'recitationTajweed')
    .every((k) => scored[k].score === DEFAULT_RATING),
  true);
check('round-trips through storage',
  EVALUATION_CRITERION_KEYS.map((k) => parseCriteria(serializeCriteria(scored))[k].score),
  EVALUATION_CRITERION_KEYS.map((k) => scored[k].score));

// ====================================================================== 3
line('3 · A COMMENT BELONGS TO ITS OWN CRITERION');

const ENGAGEMENT = 'Student was engaged for most of the lesson, but attention dropped during the final 10 minutes.';
const PUNCTUALITY = 'Joined four minutes late.';

let commented = emptyCriteria();
commented = setCriterion(commented, 'studentEngagement', { comment: ENGAGEMENT });
commented = setCriterion(commented, 'punctuality', { comment: PUNCTUALITY });

check('each criterion keeps its own comment',
  [commented.studentEngagement.comment, commented.punctuality.comment],
  [ENGAGEMENT, PUNCTUALITY]);

// THE regression this structure exists to prevent.
check('one criterion\'s comment does not overwrite another\'s',
  commented.studentEngagement.comment === commented.punctuality.comment, false);
check('an uncommented criterion stays uncommented',
  EVALUATION_CRITERION_KEYS
    .filter((k) => k !== 'studentEngagement' && k !== 'punctuality')
    .every((k) => commented[k].comment === ''),
  true);
check('writing a comment does not disturb that criterion\'s score',
  commented.studentEngagement.score, DEFAULT_RATING);
check('writing a score does not erase that criterion\'s comment',
  setCriterion(commented, 'studentEngagement', { score: 'acceptable' }).studentEngagement.comment,
  ENGAGEMENT);

const persisted = parseCriteria(serializeCriteria(commented));
check('comments survive persistence, still on the right criterion',
  [persisted.studentEngagement.comment, persisted.punctuality.comment, persisted.fushaCommitment.comment],
  [ENGAGEMENT, PUNCTUALITY, '']);

// Nine distinct comments at once — proves there is no shared field anywhere.
let allNine = emptyCriteria();
EVALUATION_CRITERION_KEYS.forEach((k, i) => {
  allNine = setCriterion(allNine, k, { comment: `comment ${i + 1}` });
});
const allNineBack = parseCriteria(serializeCriteria(allNine));
check('nine criteria carry nine distinct comments through storage',
  EVALUATION_CRITERION_KEYS.map((k) => allNineBack[k].comment),
  EVALUATION_CRITERION_KEYS.map((_, i) => `comment ${i + 1}`));

check('a whitespace-only comment is stored as no comment',
  serializeCriteria(setCriterion(emptyCriteria(), 'punctuality', { comment: '   \n  ' })).punctuality.comment,
  '');
check('a comment is stored trimmed, not mangled',
  serializeCriteria(setCriterion(emptyCriteria(), 'punctuality', { comment: `  ${PUNCTUALITY}  ` })).punctuality.comment,
  PUNCTUALITY);

// ====================================================================== 4
line('4 · THE SCORE AND GRADE RULES ARE THE PRE-EXISTING ONES');

// All 'good' (3/4) → round(0.75 * 90) = 68, + 2 for a 'good' behavioural = 70.
check('all good, good behaviour', computeEvaluationScore(emptyCriteria(), 'good'), 70);

const allExcellent = EVALUATION_CRITERION_KEYS.reduce(
  (acc, k) => setCriterion(acc, k, { score: 'excellent' }), emptyCriteria());
check('all excellent, excellent behaviour', computeEvaluationScore(allExcellent, 'excellent'), 95);
check('the score is clamped at 100',
  computeEvaluationScore(allExcellent, 'excellent') <= 100, true);

const allWorst = EVALUATION_CRITERION_KEYS.reduce(
  (acc, k) => setCriterion(acc, k, { score: 'needs_improvement' }), emptyCriteria());
// 1/4 → round(0.25*90) = 23, − 10 = 13.
check('all needs_improvement, critical behaviour', computeEvaluationScore(allWorst, 'critical_issue'), 13);
check('the score never goes below 0', computeEvaluationScore(allWorst, 'critical_issue') >= 0, true);

check('the behavioural bonus is the existing one', [
  computeEvaluationScore(emptyCriteria(), 'excellent'),
  computeEvaluationScore(emptyCriteria(), 'good'),
  computeEvaluationScore(emptyCriteria(), 'needs_improvement'),
  computeEvaluationScore(emptyCriteria(), 'critical_issue'),
], [73, 70, 63, 58]);

check('a comment never changes the score',
  computeEvaluationScore(commented, 'good'), computeEvaluationScore(emptyCriteria(), 'good'));

check('the existing grade thresholds, unchanged',
  [90, 89, 75, 74, 60, 59, 45, 44, 0].map(gradeForScore),
  ['excellent', 'good', 'good', 'average', 'average', 'weak', 'weak', 'critical', 'critical']);

// ====================================================================== 5
line('5 · TEMPLATES SET SCORES ONLY');

check('every template covers all nine criteria',
  Object.values(EVALUATION_TEMPLATES).map((t) => Object.keys(t).length), [9, 9, 9]);
check('the excellent template scores everything excellent',
  EVALUATION_CRITERION_KEYS.every((k) => applyTemplate(emptyCriteria(), 'template_excellent')[k].score === 'excellent'),
  true);
check('the attendance template is the one that flags punctuality',
  applyTemplate(emptyCriteria(), 'template_attendance').punctuality.score, 'needs_improvement');
check('a template never writes a comment',
  EVALUATION_CRITERION_KEYS.every((k) => applyTemplate(emptyCriteria(), 'template_excellent')[k].comment === ''),
  true);
check('a template never erases a comment already written',
  applyTemplate(commented, 'template_excellent').studentEngagement.comment, ENGAGEMENT);
check('an unknown template changes nothing',
  applyTemplate(commented, 'no_such_template'), commented);

// ====================================================================== 6
line('6 · BACKWARD COMPATIBILITY — HISTORICAL EVALUATIONS');

// A pre-feature row's column is the '{}' default. It must NOT read as nine
// invented ratings: that would fabricate data about a real teacher.
check('an empty criteria column reads as "no 9-criteria data"', parseCriteria({}), null);
check('SQL NULL reads the same way', parseCriteria(null), null);
check('an absent column reads the same way', parseCriteria(undefined), null);
check('a non-object column does not throw',
  [parseCriteria('{}'), parseCriteria(7), parseCriteria([])], [null, null, null]);

// A row written by a different build than the one reading it.
const partial = parseCriteria({ punctuality: { score: 'excellent', comment: 'On time.' } });
check('a row missing most keys still yields all nine', Object.keys(partial).length, 9);
check('the key that was present is read exactly',
  [partial.punctuality.score, partial.punctuality.comment], ['excellent', 'On time.']);
check('the keys that were absent fall back to the default rating, uncommented',
  [partial.recitationTajweed.score, partial.recitationTajweed.comment], [DEFAULT_RATING, '']);

check('an unknown criterion key is ignored, not surfaced',
  Object.keys(parseCriteria({ punctuality: { score: 'good' }, retiredCriterion: { score: 'excellent' } })),
  [...EVALUATION_CRITERION_KEYS]);
check('an unrecognised score falls back rather than throwing',
  parseCriteria({ punctuality: { score: 'superb' } }).punctuality.score, DEFAULT_RATING);
check('a non-string comment becomes an empty comment',
  parseCriteria({ punctuality: { score: 'good', comment: 42 } }).punctuality.comment, '');
check('a malformed entry falls back rather than throwing',
  [parseCriteria({ punctuality: null }).punctuality,
   parseCriteria({ punctuality: 'good' }).punctuality],
  [{ score: DEFAULT_RATING, comment: '' }, { score: DEFAULT_RATING, comment: '' }]);

// A historical evaluation's own score is a plain number on the same 0-100
// scale, so every average and badge keeps working across the two eras.
check('a historical score still grades on the same thresholds',
  [92, 81, 64, 47, 20].map(gradeForScore),
  ['excellent', 'good', 'average', 'weak', 'critical']);

// ====================================================================== 7
line('7 · VALIDATION');

check('no teacher selected fails validation',
  validateEvaluationDraft({ teacherId: '' }), ['teacher_required']);
check('whitespace is not a teacher',
  validateEvaluationDraft({ teacherId: '   ' }), ['teacher_required']);
check('a selected teacher passes',
  validateEvaluationDraft({ teacherId: 'f1e2d3c4-0000-0000-0000-000000000001' }), []);
// Comments are OPTIONAL — the pre-existing contract for the one comment field
// that already existed, extended unchanged to the new ones.
check('an evaluation with no comments at all is valid',
  validateEvaluationDraft({ teacherId: 't1' }), []);

// ====================================================================== 8
line('8 · TEACHER SEARCH (the shared rule, over an evaluation roster)');

/**
 * The teacher selector passes `fullName` to SearchableSelect, which matches it
 * with the shared `matchesSearch`. These assert the cases the requirement
 * names, against the rule the control actually uses.
 */
const ROSTER = ['محمد حسين', 'محمد عبد الله', 'حسين أحمد', 'Arwa Ahmed ', 'Ashraf Elzohdy'];
const find = (q) => ROSTER.filter((n) => matchesSearch(n, q));

check('Arabic full name', find('محمد حسين'), ['محمد حسين']);
check('Arabic first name finds the teacher', find('محمد'), ['محمد حسين', 'محمد عبد الله']);
check('Arabic LAST name finds the same teacher', find('حسين'), ['محمد حسين', 'حسين أحمد']);
check('Arabic partial, mid-name', find('حسي'), ['محمد حسين', 'حسين أحمد']);
check('Arabic words typed in reverse order', find('حسين محمد'), ['محمد حسين']);
check('English partial name', find('Arwa'), ['Arwa Ahmed ']);
check('English is case-insensitive', find('aRwA'), ['Arwa Ahmed ']);
check('English last name only', find('Elzohdy'), ['Ashraf Elzohdy']);
check('no result for a name nobody has', find('Nonexistent'), []);
check('an empty query shows the whole roster', find('').length, ROSTER.length);

// ======================================================================
console.log(results.join('\n'));
console.log('-'.repeat(78));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

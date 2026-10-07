/**
 * STATIC assertions over the evaluation feature's real sources.
 *
 * These catch regressions a unit test on the pure module cannot see, because
 * they are about how the screens are WIRED rather than what the functions
 * return:
 *
 *   A  the teacher selector is the app's searchable one, not a plain <Select>.
 *      This is the searchable-select policy that selectors.test.mjs already
 *      enforces over src/features/scheduling, applied to the one evaluation
 *      screen — an unsearchable list of every teacher in the academy is the
 *      exact defect this feature was asked to remove, and it must not come
 *      back by someone pasting the old block in.
 *
 *   B  per-criterion comments go through setCriterion, so no handler can
 *      write one criterion's comment onto another.
 *
 *   C  every criterion has a label in BOTH languages, under the app's i18n
 *      system rather than hard-coded in the component.
 *
 *   D  the general comment is rendered under the teacher's name in the
 *      evaluation list, and only when there is one.
 *
 * No browser, no database.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let pass = 0, fail = 0;
const results = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}` +
    (ok ? '' : `\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`));
}

const ROOT = process.env.REPO_ROOT ?? process.cwd();
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const FORM = read('src/features/action-center/SessionEvaluationForm.tsx');
const LIST = read('src/features/action-center/ActionCenterPage.tsx');
const CRITERIA = read('src/lib/evaluationCriteria.ts');
const EN = JSON.parse(read('src/i18n/en.json'));
const AR = JSON.parse(read('src/i18n/ar.json'));

/**
 * The nine keys, read out of the EVALUATION_CRITERION_KEYS block specifically.
 * Scoped to that declaration rather than swept off the whole file, which would
 * also collect RATING_OPTIONS' members and silently inflate the count.
 */
const KEYS = (() => {
  const block = /export const EVALUATION_CRITERION_KEYS = \[([\s\S]*?)\] as const;/.exec(CRITERIA);
  if (!block) throw new Error('EVALUATION_CRITERION_KEYS not found in src/lib/evaluationCriteria.ts');
  return [...block[1].matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1]);
})();

console.log('='.repeat(78));
console.log('A · THE TEACHER SELECTOR IS SEARCHABLE');
console.log('='.repeat(78));

check('A  the form uses SearchableSelect', FORM.includes('<SearchableSelect'), true);
check('A  the form has NO plain <Select> over a teacher collection',
  /<Select[\s>][\s\S]*?teachers?[\s\S]*?\.map\(/.test(FORM), false);
check('A  searchability is declared, not inferred from the option count',
  /searchable(\s|$|\n)/.test(FORM) && !/options\.length\s*>/.test(FORM), true);
check('A  the selector is fed from the existing teacher store, and only reports an id back',
  FORM.includes('useTeacherStore') && /value: tc\.id/.test(FORM), true);
check('A  exactly ONE teacher selector — an evaluation has one teacher',
  (FORM.match(/<SearchableSelect[\s>]/g) ?? []).length, 1);
check('A  it is a required field with an error message',
  FORM.includes("'evaluation.teacherRequired'") && FORM.includes('aria-invalid'), true);
check('A  saving re-checks the teacher rather than trusting the button',
  /if \(validateEvaluationDraft\(\{ teacherId \}\)\.length > 0\) return;/.test(FORM), true);
check('A  no-results and search placeholders are provided',
  FORM.includes('emptyText') && FORM.includes('searchPlaceholder'), true);

console.log('='.repeat(78));
console.log('B · ONE COMMENT PER CRITERION, VIA ONE CODE PATH');
console.log('='.repeat(78));

check('B  nine criteria are rendered from the shared list, not re-listed here',
  FORM.includes('EVALUATION_CRITERION_KEYS.map('), true);
check('B  the form holds no second copy of the criterion keys',
  KEYS.filter((k) => FORM.includes(`'${k}'`)), []);
check('B  each criterion renders its own comment field',
  FORM.includes('criterion-${key}-comment'), true);
check('B  comments are written through setCriterion, which patches ONE key',
  /setCriterion\(prev, key, \{ comment: e\.target\.value \}\)/.test(FORM), true);
check('B  scores are written the same way',
  /setCriterion\(prev, key, \{ score: rating \}\)/.test(FORM), true);
check('B  the form keeps no shared comment state across criteria',
  /\[criterionComment, setCriterionComment\]|sharedComment/.test(FORM), false);

console.log('='.repeat(78));
console.log('C · LABELS COME FROM i18n, IN BOTH LANGUAGES');
console.log('='.repeat(78));

check('C  the pure module exports nine keys', KEYS.length, 9);
check('C  the form looks labels up via i18n',
  FORM.includes('`evaluation.criterion.${key}`'), true);
check('C  every criterion has an English label',
  KEYS.filter((k) => !EN.evaluation?.criterion?.[k]), []);
check('C  every criterion has an Arabic label',
  KEYS.filter((k) => !AR.evaluation?.criterion?.[k]), []);
check('C  the Arabic labels are actually Arabic, not copied English',
  KEYS.filter((k) => !/[؀-ۿ]/.test(AR.evaluation.criterion[k])), []);
check('C  the new UI strings exist in both languages',
  ['criteriaTitle', 'selectTeacher', 'teacherRequired', 'criterionComment',
   'criterionCommentPlaceholder', 'generalComment', 'generalCommentHint',
   'generalCommentPlaceholder']
    .filter((k) => !EN.evaluation?.[k] || !AR.evaluation?.[k]),
  []);
check('C  the legacy criterion labels are left in place for historical data',
  ['tajweedAccuracy', 'pronunciation', 'listeningSkills', 'parentCommunication']
    .filter((k) => !EN.evaluation?.[k] || !AR.evaluation?.[k]),
  []);

console.log('='.repeat(78));
console.log('D · THE GENERAL COMMENT IS SEPARATE, AND IS DISPLAYED');
console.log('='.repeat(78));

check('D  the form has its own general-comment field',
  FORM.includes('data-testid="evaluation-general-comment"'), true);
check('D  it is headed as the general comment, apart from the criteria',
  FORM.includes("t('evaluation.generalComment')"), true);
check('D  it is saved to the whole-evaluation field, not into a criterion',
  /customNote: generalComment\.trim\(\)/.test(FORM), true);
check('D  it is NOT written into criteria',
  /setCriterion\([^)]*generalComment/.test(FORM), false);

// The display requirement: teacher name, then the general comment, then the rest.
const row = LIST.slice(LIST.indexOf('evaluations.slice(0, 20)'));
const namePos = row.indexOf('getTeacherName(ev.teacherId)');
const commentPos = row.indexOf('ev.customNote');
const datePos = row.indexOf('formatDate(ev.sessionDate');

check('D  the evaluation row renders the general comment', commentPos !== -1, true);
check('D  it sits AFTER the teacher name', namePos !== -1 && commentPos > namePos, true);
check('D  and BEFORE the remaining evaluation information', commentPos < datePos, true);
check('D  it is rendered only when there is one — never fabricated for a historical row',
  /ev\.customNote\?\.trim\(\) && \(/.test(row), true);
check('D  it is understated rather than dominant (small and muted)',
  /text-xs[^"]*italic[^"]*text-gray-600|text-xs italic text-gray-600/.test(row), true);
check('D  a long comment cannot blow the row open',
  /line-clamp-3/.test(row), true);
check('D  no physical left/right in the row, so RTL mirrors correctly',
  /\b(ml-|mr-|pl-|pr-|left-|right-|text-left|text-right)\d*/.test(
    row.slice(0, row.indexOf('DeleteBtn kind="evaluation"'))),
  false);

console.log(results.join('\n'));
console.log('-'.repeat(78));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

/**
 * LEGACY SCHEDULE ANCHORS, proven against the real source:
 *
 *   src/features/scheduling/utils/legacyAnchor.ts         (the distinction)
 *   src/features/scheduling/utils/buildScheduleRoster.ts  (what the grid draws)
 *   and, statically, the real .tsx selection sites
 *
 * THE DEFECT THIS DEFENDS AGAINST. teacher_shift_assignments.teacher_id and
 * teacher_availability.teacher_id both reference teachers(id) with ON DELETE
 * CASCADE, so the rebuild cannot delete the old teacher rows that preserved
 * schedule rows point at -- it retains them. But buildScheduleRoster used to
 * build its lookup from non-deleted teachers only and drop whatever it could
 * not resolve, so a retained anchor's assignments disappeared from the grid
 * and a group left with no resolvable members vanished entirely. The schedule
 * rows survived in the database and in v_teacher_availability_unified while
 * being invisible in the view the user actually looks at.
 *
 * So the assertions below are not about a boolean. They run the real roster
 * computation and check what it renders, and they read the real .tsx sources
 * to check that nothing offers an anchor new work.
 *
 * Fixtures only -- no database, no production teacher records.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildScheduleRoster,
  buildScheduleRosterWithDiagnostics,
} from './buildScheduleRoster.mjs';
import {
  isLegacyScheduleAnchor,
  isActiveTeacher,
  isScheduleDisplayable,
} from './legacyAnchor.mjs';

const ROOT = process.env.REPO_ROOT ?? process.cwd();

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
}

// --- fixtures --------------------------------------------------------------

const teacher = (id, name, over = {}) => ({
  id, fullName: name, phone: '', email: '', nationality: '',
  monthlySalary: 0, salaryCurrency: 'EGP', salaryType: 'fixed',
  teachingMarket: 'arab', specializations: [], status: 'active',
  level: 'silver', notes: '', isDeleted: false,
  createdAt: '2026-01-01', updatedAt: '2026-01-01', ...over,
});

/** The rebuild's anchor state: BOTH markers set. */
const ANCHOR = { isDeleted: true, status: 'inactive' };
/** An ordinary soft delete: deleteTeacher() leaves status alone. */
const ORDINARY_DELETE = { isDeleted: true, status: 'active' };

const ACTIVE = teacher('t-active', 'Amal');
const ANCHORED = teacher('t-anchor', 'Zahra', ANCHOR);
const SOFT_DELETED = teacher('t-soft', 'Hana', ORDINARY_DELETE);

const TPL = {
  id: 'tpl-morning', branchId: 'b-1', name: 'Morning',
  startMinute: 480, endMinute: 720, timezone: 'Asia/Dubai', isActive: true,
  createdAt: '2026-01-01', updatedAt: '2026-01-01',
};
const assign = (id, teacherId, over = {}) => ({
  id, teacherId, shiftTemplateId: TPL.id, dayOfWeek: 1, isActive: true,
  createdAt: '2026-01-01', updatedAt: '2026-01-01', ...over,
});

console.log('A  the preserved schedule stays visible');

// 1. An anchor's existing assignment still renders.
{
  const groups = buildScheduleRoster([TPL], [assign('sa-1', ANCHORED.id)], [ANCHORED]);
  check('A1 a group whose only member is an anchor still renders',
    groups.map((g) => g.templateId), ['tpl-morning']);
  check('A1 the anchor is the rendered member',
    groups[0].teachers.map((t) => t.id), ['t-anchor']);
  check('A1 and it is named as legacy',
    groups[0].legacyTeacherIds, ['t-anchor']);
}

// The exact regression: this returned [] before the fix.
{
  const groups = buildScheduleRoster(
    [TPL], [assign('sa-1', ANCHORED.id), assign('sa-2', ACTIVE.id, { dayOfWeek: 2 })],
    [ACTIVE, ANCHORED]);
  check('A2 an anchor beside an active teacher does not hide the group',
    groups.length, 1);
  check('A2 both are rendered, active first',
    groups[0].teachers.map((t) => t.id), ['t-active', 't-anchor']);
  check('A2 only the anchor is flagged legacy',
    groups[0].legacyTeacherIds, ['t-anchor']);
}

console.log('\nB  an anchor is not a current teacher');

check('B1 an anchor is not an active teacher', isActiveTeacher(ANCHORED), false);
check('B2 an anchor IS displayable in the schedule', isScheduleDisplayable(ANCHORED), true);
check('B3 an active teacher is active', isActiveTeacher(ACTIVE), true);
check('B4 an anchor is recognised by BOTH markers', isLegacyScheduleAnchor(ANCHORED), true);
check('B5 status inactive alone is not an anchor',
  isLegacyScheduleAnchor(teacher('x', 'X', { isDeleted: false, status: 'inactive' })), false);
check('B6 isDeleted alone is not an anchor', isLegacyScheduleAnchor(SOFT_DELETED), false);

console.log('\nC  an ordinary soft delete is not admitted to the legacy path');

// 5. The non-legacy soft-deleted teacher must stay hidden, as before.
{
  const d = buildScheduleRosterWithDiagnostics(
    [TPL], [assign('sa-1', SOFT_DELETED.id)], [SOFT_DELETED]);
  check('C1 an ordinarily deleted teacher renders nothing', d.groups.length, 0);
  check('C2 and is reported as hidden rather than dropped silently',
    d.hiddenSoftDeleted, [{ teacherId: 't-soft', templateId: 'tpl-morning' }]);
  check('C3 not as unresolved', d.unresolved, []);
  check('C4 and never displayable', isScheduleDisplayable(SOFT_DELETED), false);
}

console.log('\nD  an unresolvable assignment is reported, not swallowed');

// 6. A reference to a teacher row that is not present.
{
  const d = buildScheduleRosterWithDiagnostics(
    [TPL], [assign('sa-1', 'ghost-teacher'), assign('sa-2', ACTIVE.id)], [ACTIVE]);
  check('D1 the resolvable member still renders',
    d.groups[0].teachers.map((t) => t.id), ['t-active']);
  check('D2 the missing teacher is reported explicitly',
    d.unresolved, [{ teacherId: 'ghost-teacher', templateId: 'tpl-morning' }]);
}
{
  // Every member unresolvable: the group goes, but it says why.
  const d = buildScheduleRosterWithDiagnostics(
    [TPL], [assign('sa-1', 'ghost-a'), assign('sa-2', 'ghost-b')], []);
  check('D3 a group lost entirely is accounted for', d.groups.length, 0);
  check('D4 with every missing reference named',
    d.unresolved.map((u) => u.teacherId).sort(), ['ghost-a', 'ghost-b']);
}

console.log('\nE  the schedule rows themselves are untouched');

// 7. The computation must not mutate or remap anything.
{
  const templates = [structuredClone(TPL)];
  const assignments = [assign('sa-1', ANCHORED.id), assign('sa-2', ACTIVE.id)];
  const teachers = [structuredClone(ACTIVE), structuredClone(ANCHORED)];
  const before = JSON.stringify({ templates, assignments, teachers });
  buildScheduleRosterWithDiagnostics(templates, assignments, teachers);
  check('E1 inputs are not mutated',
    JSON.stringify({ templates, assignments, teachers }), before);
  check('E2 no assignment is retargeted to another teacher',
    assignments.map((a) => `${a.id}:${a.teacherId}`),
    ['sa-1:t-anchor', 'sa-2:t-active']);
  check('E3 the template window is unchanged',
    [templates[0].startMinute, templates[0].endMinute], [480, 720]);
}

console.log('\nF  repeated planning is deterministic');

// 8. Same inputs, same output, including ordering.
{
  const args = [[TPL], [assign('sa-1', ANCHORED.id), assign('sa-2', ACTIVE.id)],
    [ANCHORED, ACTIVE]];
  const a = JSON.stringify(buildScheduleRosterWithDiagnostics(...args));
  const b = JSON.stringify(buildScheduleRosterWithDiagnostics(...args));
  check('F1 two runs agree exactly', a === b, true);
  // Input order must not change the rendered order.
  const reordered = JSON.stringify(buildScheduleRosterWithDiagnostics(
    [TPL], [assign('sa-2', ACTIVE.id), assign('sa-1', ANCHORED.id)], [ACTIVE, ANCHORED]));
  check('F2 input order does not change the roster',
    JSON.parse(reordered).groups[0].teachers.map((t) => t.id), ['t-active', 't-anchor']);
}

console.log('\nG  nothing offers an anchor new work (real .tsx sources)');

// 3 and 4. The selection sites are components, so they are checked against
// the real source: each must exclude isDeleted, which excludes an anchor.
// A behavioural predicate check alone would not notice a new picker.
const SELECTION_SITES = [
  ['src/features/scheduling/LessonsPage.tsx', 'lesson teacher list'],
  ['src/features/scheduling/components/LessonQuickActionsSheet.tsx', 'reassignment pool'],
  ['src/features/scheduling/PrimaryTeacherReviewPage.tsx', 'Smart Assistant candidates'],
];
for (const [file, label] of SELECTION_SITES) {
  const src = readFileSync(join(ROOT, file), 'utf8');
  check(`G ${label} filters out deleted teachers`,
    /!\s*\w+\.isDeleted/.test(src), true);
}
{
  // Smart Assistant specifically requires status === 'active' too, so an
  // anchor fails on both counts.
  const src = readFileSync(join(ROOT, 'src/features/scheduling/PrimaryTeacherReviewPage.tsx'), 'utf8');
  check('G Smart Assistant requires status active',
    /!\w+\.isDeleted\s*&&\s*\w+\.status\s*===\s*'active'/.test(src), true);
}
{
  // The roster page hides deleted teachers by default.
  const src = readFileSync(join(ROOT, 'src/features/teachers/TeachersPage.tsx'), 'utf8');
  check('G the teachers page hides deleted rows by default',
    /useState\(false\)/.test(src.slice(src.indexOf('showDeleted') - 40,
      src.indexOf('showDeleted') + 60)), true);
}
{
  // And the roster builder must not have gone back to pre-filtering.
  const src = readFileSync(join(ROOT,
    'src/features/scheduling/utils/buildScheduleRoster.ts'), 'utf8');
  check('G the roster no longer pre-filters deleted teachers out of the lookup',
    /teachers\.filter\(\(t\) => !t\.isDeleted\)\.map/.test(src), false);
  check('G and it resolves from every teacher',
    /new Map\(teachers\.map\(\(t\) => \[t\.id, t\]\)\)/.test(src), true);
}

console.log('\n' + '='.repeat(78));
console.log(`TOTAL: ${pass} passed, ${fail} failed`);
console.log('='.repeat(78));
process.exit(fail === 0 ? 0 : 1);

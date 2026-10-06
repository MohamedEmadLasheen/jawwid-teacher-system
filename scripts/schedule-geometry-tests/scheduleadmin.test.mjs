/**
 * RESPONSIBLE ADMIN IN THE SCHEDULE, proven against the real source in
 * src/features/scheduling/utils/studentAdminAssignment.ts.
 *
 * What this suite is defending:
 *
 *   * Ownership stays on the STUDENT. Every write these functions produce is
 *     addressed to a student id and carries nothing but a supervisor id —
 *     there is no lesson id, no lesson-level field, and no colour anywhere in
 *     the output. That is asserted structurally, not just by inspection.
 *   * A student's Admin is the same in every lesson, because there is only
 *     one place it can come from: the student record.
 *   * An existing assignment is PRESERVED. Creating a lesson for students who
 *     already have an Admin produces zero writes.
 *   * Each student in a group is independent — no Admin is ever applied to
 *     all of them because one of them has it.
 *   * An unassigned student blocks creation until a human chooses.
 *
 * Fixtures only — no database, no production records.
 */
import {
  resolveStudentAdminRows, missingAdminStudentIds, blockingAdminStudentIds,
  pendingAdminWrites,
} from './studentAdminAssignment.mjs';

let pass = 0, fail = 0;
const results = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}` +
    (ok ? '' : `\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`));
}

// ── fixtures ────────────────────────────────────────────────────────────
const DINA = 'adm-dina', ZAINAB = 'adm-zainab', REHAB = 'adm-rehab', ASMAA = 'adm-asmaa';

const student = (id, fullName, supervisorId) => ({
  id, fullName, supervisorId, country: '', timezone: 'Asia/Dubai', level: '',
  status: 'active', enrollmentSource: '', isReturning: false, courseId: null,
  notes: '', isDeleted: false, createdAt: '', updatedAt: '',
});

const ARWA = student('S-arwa', 'Arwa Ahmed', DINA);
const AHMED = student('S-ahmed', 'Ahmed Mohamed', null);     // unassigned
const OMAR = student('S-omar', 'Omar Ali', ASMAA);
const STUDENTS = [ARWA, AHMED, OMAR];

const rowsOf = (ids, drafts) => resolveStudentAdminRows(ids, STUDENTS, drafts);

// ── A. an already-assigned student ──────────────────────────────────────
{
  const rows = rowsOf([ARWA.id]);
  check('A  an assigned student is prefilled from the student record',
    rows.map((r) => [r.fullName, r.effectiveSupervisorId]), [['Arwa Ahmed', DINA]]);
  check('A  …and is not missing', rows[0].isMissing, false);
  check('A  …and needs no write, so the existing assignment is preserved',
    pendingAdminWrites(rows), []);
  check('A  …and does not block creation', missingAdminStudentIds(rows), []);
}

// ── B. an unassigned student ────────────────────────────────────────────
{
  const before = rowsOf([AHMED.id]);
  check('B  an unassigned student is missing', before[0].isMissing, true);
  check('B  …and blocks creation', missingAdminStudentIds(before), [AHMED.id]);
  check('B  …and produces no write while nothing is chosen', pendingAdminWrites(before), []);

  const after = rowsOf([AHMED.id], { [AHMED.id]: REHAB });
  check('B  choosing Rehab clears the block', missingAdminStudentIds(after), []);
  check('B  …and writes exactly that student, to supervisorId only',
    pendingAdminWrites(after), [{ studentId: AHMED.id, supervisorId: REHAB }]);
}

// ── C. reassignment ─────────────────────────────────────────────────────
{
  const rows = rowsOf([ARWA.id], { [ARWA.id]: ASMAA });
  check('C  Dina -> Asmaa is a change', [rows[0].storedSupervisorId, rows[0].effectiveSupervisorId],
    [DINA, ASMAA]);
  check('C  …and writes one student row', pendingAdminWrites(rows),
    [{ studentId: ARWA.id, supervisorId: ASMAA }]);

  // Re-picking what is already stored is not a change.
  check('C  re-selecting the current Admin writes nothing',
    pendingAdminWrites(rowsOf([ARWA.id], { [ARWA.id]: DINA })), []);
}

// ── D. several students, independently ──────────────────────────────────
{
  const rows = rowsOf([ARWA.id, AHMED.id, OMAR.id]);
  check('D  each student shows their own Admin',
    rows.map((r) => [r.fullName, r.effectiveSupervisorId]),
    [['Arwa Ahmed', DINA], ['Ahmed Mohamed', null], ['Omar Ali', ASMAA]]);
  check('D  one unassigned student among three still blocks creation',
    missingAdminStudentIds(rows), [AHMED.id]);

  // THE regression this guards: choosing for one student must not splash
  // onto the others.
  const chosen = rowsOf([ARWA.id, AHMED.id, OMAR.id], { [AHMED.id]: ZAINAB });
  check('D  choosing for one student changes only that student',
    chosen.map((r) => [r.fullName, r.effectiveSupervisorId]),
    [['Arwa Ahmed', DINA], ['Ahmed Mohamed', ZAINAB], ['Omar Ali', ASMAA]]);
  check('D  …and writes only that student',
    pendingAdminWrites(chosen), [{ studentId: AHMED.id, supervisorId: ZAINAB }]);
  check('D  rows follow the selection order', rows.map((r) => r.studentId),
    [ARWA.id, AHMED.id, OMAR.id]);
}

// ── E. the write shape — ownership stays on the student ─────────────────
{
  const writes = pendingAdminWrites(rowsOf([AHMED.id, ARWA.id], {
    [AHMED.id]: REHAB, [ARWA.id]: ZAINAB,
  }));
  check('E  every write carries exactly a student id and a supervisor id',
    writes.map((w) => Object.keys(w).sort()),
    [['studentId', 'supervisorId'], ['studentId', 'supervisorId']]);
  const keys = writes.flatMap((w) => Object.keys(w));
  check('E  no write mentions a lesson', keys.filter((k) => /lesson/i.test(k)), []);
  check('E  no write carries a colour', keys.filter((k) => /colou?r/i.test(k)), []);
  check('E  no write invents an ownership field',
    keys.filter((k) => !['studentId', 'supervisorId'].includes(k)), []);
}

// ── F. edge cases ───────────────────────────────────────────────────────
{
  check('F  no selected students means no rows', rowsOf([]), []);
  check('F  an unknown student id is dropped, never rendered as a blank row',
    rowsOf(['S-missing']).length, 0);
  check('F  an empty draft is "not chosen yet", not "clear it"',
    rowsOf([ARWA.id], { [ARWA.id]: '' })[0].effectiveSupervisorId, DINA);
  check('F  …and whitespace is not a choice either',
    rowsOf([ARWA.id], { [ARWA.id]: '   ' })[0].effectiveSupervisorId, DINA);
  check('F  a draft for a student who is no longer selected is ignored',
    pendingAdminWrites(rowsOf([ARWA.id], { [AHMED.id]: REHAB })), []);
  check('F  this panel can assign and reassign, but never un-assign',
    rowsOf([ARWA.id, OMAR.id], { [ARWA.id]: '', [OMAR.id]: '' })
      .every((r) => !r.isMissing && !r.isChanged), true);
}

// ── G. a requirement you cannot satisfy is a deadlock ───────────────────
{
  const rows = rowsOf([AHMED.id, ARWA.id]);
  check('G  with four Admins available, the unassigned student blocks',
    blockingAdminStudentIds(rows, 4), [AHMED.id]);
  check('G  with ONE Admin available it still blocks', blockingAdminStudentIds(rows, 1), [AHMED.id]);
  // The deadlock case: nothing to choose, so scheduling must stay possible.
  check('G  with no Admin configured, nothing blocks — the schedule still works',
    blockingAdminStudentIds(rows, 0), []);
  check('G  …and the underlying fact is unchanged, only the enforcement',
    missingAdminStudentIds(rows), [AHMED.id]);
  check('G  no Admins also means no writes are invented',
    pendingAdminWrites(rows), []);
}

console.log('\n── Responsible Admin in the Schedule ───────────────────────');
results.forEach((line) => console.log('  ' + line));
console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);

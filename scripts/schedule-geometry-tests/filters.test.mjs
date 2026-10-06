/**
 * THE schedule filter semantics, proven against the real pipeline in
 * src/features/scheduling/utils/deriveScheduleRows.ts.
 *
 * What this suite is defending:
 *
 *   * AND across categories, OR within one. "Full-time + Dina + Trial" must
 *     mean full-time teachers, showing Dina's trial lessons — not the union
 *     of three sets.
 *   * Free time is real unsold capacity. The predecessor implementation did
 *     `if (filters.availableOnly) teacherLessons = []`, which emptied the
 *     row and then reported the teacher's whole shift as free. Several
 *     assertions below fail on that code and pass on this one.
 *   * Filtering never invents capacity. A row's free bands come from its
 *     unfiltered `occupancy`, so hiding a lesson (status, supervisor, …)
 *     must not repaint its minutes red.
 *   * Outside shift comes from the teacher's own availability window, never
 *     from the grid bounds.
 *
 * Fixtures only — no database, no production lesson records.
 */
import { deriveScheduleRows, applyOccurrenceExceptions } from './deriveScheduleRows.mjs';
import { computeRowLayout } from './computeRowLayout.mjs';
import { buildScheduleRoster } from './buildScheduleRoster.mjs';

let pass = 0, fail = 0;
const results = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}` +
    (ok ? '' : `\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`));
}
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const fmt = (list) => list.map((i) => `${hhmm(i.startMinute)}-${hhmm(i.endMinute)}`);

// ── fixtures ────────────────────────────────────────────────────────────
// Two shift groups, derived the way production derives them: shift templates
// + active assignments. No group name, window or headcount is written down
// anywhere a filter can read it.
const DAY = 0;
const FULL_TPL = { id: 'tpl-full', name: 'Full-time', startMinute: 12 * 60, endMinute: 19 * 60, timezone: 'Asia/Dubai', isActive: true, createdAt: '', updatedAt: '' };
const PART_TPL = { id: 'tpl-part', name: 'Part-time', startMinute: 14 * 60, endMinute: 18 * 60, timezone: 'Asia/Dubai', isActive: true, createdAt: '', updatedAt: '' };

const teacher = (id, fullName, over = {}) => ({
  id, fullName, isDeleted: false, teacherType: over.teacherType ?? 'shift',
});

// FT-1..FT-3 full-time, PT-1..PT-2 part-time. NOWIN has an assignment but no
// availability row for this day — the "no working window" case.
const TEACHERS = [
  teacher('FT-1', 'Arwa Ahmed'), teacher('FT-2', 'Doaa Zakaria'), teacher('FT-3', 'Hend Mohammed'),
  teacher('PT-1', 'Aya Mustafa'), teacher('PT-2', 'Zainab Hazem'),
  teacher('NOWIN', 'Zeina Noshift'),
  teacher('GONE', 'Deleted Teacher'),
];
TEACHERS.find((t) => t.id === 'GONE').isDeleted = true;

const assign = (teacherId, shiftTemplateId) => ({
  id: `${teacherId}-${shiftTemplateId}`, teacherId, shiftTemplateId, dayOfWeek: DAY,
  isActive: true, createdAt: '', updatedAt: '',
});
const ASSIGNMENTS = [
  assign('FT-1', FULL_TPL.id), assign('FT-2', FULL_TPL.id), assign('FT-3', FULL_TPL.id),
  assign('PT-1', PART_TPL.id), assign('PT-2', PART_TPL.id),
  assign('NOWIN', PART_TPL.id), assign('GONE', FULL_TPL.id),
];

const ROSTER = buildScheduleRoster([FULL_TPL, PART_TPL], ASSIGNMENTS, TEACHERS);
const ROSTER_TEACHERS = ROSTER.flatMap((g) => g.teachers);
const TEMPLATE_IDS_BY_TEACHER = new Map();
for (const group of ROSTER) {
  for (const t of group.teachers) {
    TEMPLATE_IDS_BY_TEACHER.set(t.id, [...(TEMPLATE_IDS_BY_TEACHER.get(t.id) ?? []), group.templateId]);
  }
}

const slot = (teacherId, startMinute, endMinute) => ({
  teacherId, dayOfWeek: DAY, startMinute, endMinute, timezone: 'Asia/Dubai', source: 'shift',
});
// Every roster teacher is on their group's window — except NOWIN, who has none.
const AVAILABILITY = [
  slot('FT-1', 12 * 60, 19 * 60), slot('FT-2', 12 * 60, 19 * 60), slot('FT-3', 12 * 60, 19 * 60),
  slot('PT-1', 14 * 60, 18 * 60), slot('PT-2', 14 * 60, 18 * 60),
];

// Supervisors own students; a lesson "matches Dina" when a participant's
// student belongs to Dina. Nothing links a supervisor to a teacher.
const DINA = 'sup-dina', ZAINAB = 'sup-zainab', REHAB = 'sup-rehab';
const STUDENTS = [
  { id: 'S-d1', fullName: 'Ahmed Dina', supervisorId: DINA },
  { id: 'S-d2', fullName: 'Sara Dina', supervisorId: DINA },
  { id: 'S-z1', fullName: 'Omar Zainab', supervisorId: ZAINAB },
  { id: 'S-r1', fullName: 'Layla Rehab', supervisorId: REHAB },
  { id: 'S-none', fullName: 'Unassigned Student', supervisorId: null },
];
const SUPERVISOR_BY_STUDENT = new Map(STUDENTS.map((s) => [s.id, s.supervisorId]));
const NAME_BY_STUDENT = new Map(STUDENTS.map((s) => [s.id, s.fullName]));

const lesson = (id, teacherId, startMinute, over = {}) => ({
  id, teacherId, courseId: over.courseId ?? null, dayOfWeek: DAY,
  startMinute, durationMinutes: over.durationMinutes ?? 60,
  endMinute: startMinute + (over.durationMinutes ?? 60),
  lifecycleStatus: over.lifecycleStatus ?? 'active',
  participants: (over.students ?? ['S-none']).map((s, i) => ({ id: `${id}-p${i}`, lessonId: id, studentId: s })),
});

/**
 * The day:
 *   FT-1  13:00 active (Dina) + 15:00 trial (Zainab)   → mixed free/occupied
 *   FT-2  12:00-19:00 one block, fully booked           → no free capacity
 *   FT-3  (no lessons)                                  → entirely free
 *   PT-1  14:00 active (Rehab) + 19:00 active (Dina)    → one lesson OUTSIDE 14-18
 *   PT-2  10:00 active (Zainab)                         → entirely outside 14-18
 *   NOWIN 15:00 active (Dina)                           → no window at all
 */
const LESSONS = [
  lesson('L-ft1-a', 'FT-1', 13 * 60, { students: ['S-d1'] }),
  lesson('L-ft1-t', 'FT-1', 15 * 60, { students: ['S-z1'], lifecycleStatus: 'trial' }),
  lesson('L-ft2-all', 'FT-2', 12 * 60, { durationMinutes: 7 * 60, students: ['S-d2'] }),
  lesson('L-pt1-in', 'PT-1', 14 * 60, { students: ['S-r1'] }),
  lesson('L-pt1-out', 'PT-1', 19 * 60, { students: ['S-d1'] }),
  lesson('L-pt2-out', 'PT-2', 10 * 60, { students: ['S-z1'] }),
  lesson('L-nowin', 'NOWIN', 15 * 60, { students: ['S-d1'] }),
];

const DEFAULTS = {
  teacherIds: [], courseIds: [], studentIds: [], coursePendingOnly: false,
  teacherType: null, shiftTemplateIds: [], supervisorIds: [], lifecycleStatuses: [],
  availableOnly: false, outsideShiftOnly: false, primeTimeOnly: false,
  groupFilter: null, timeRangeStart: null, timeRangeEnd: null,
};

const derive = (filters = {}, searchQuery = '', lessons = LESSONS) =>
  deriveScheduleRows({
    rosterTeachers: ROSTER_TEACHERS,
    lessons,
    availability: AVAILABILITY,
    supervisorIdByStudentId: SUPERVISOR_BY_STUDENT,
    studentNameById: NAME_BY_STUDENT,
    templateIdsByTeacherId: TEMPLATE_IDS_BY_TEACHER,
    filters: { ...DEFAULTS, ...filters },
    searchQuery,
  });
const teacherIdsOf = (rows) => rows.map((r) => r.teacher.id);
const lessonIdsOf = (rows) => rows.flatMap((r) => r.lessons.map((l) => l.id));
const rowFor = (rows, id) => rows.find((r) => r.teacher.id === id);

console.log('='.repeat(78));
console.log('BASELINE — NO FILTERS BEHAVES EXACTLY AS BEFORE');
console.log('='.repeat(78));

check('no filters: every roster teacher has a row, in roster order',
  teacherIdsOf(derive()), ['FT-1', 'FT-2', 'FT-3', 'PT-1', 'PT-2', 'NOWIN']);
check('no filters: a soft-deleted teacher never gets a row',
  teacherIdsOf(derive()).includes('GONE'), false);
check('no filters: every lesson is visible', lessonIdsOf(derive()).sort(),
  LESSONS.map((l) => l.id).sort());
check('no filters: a lesson is attached to its own teacher only',
  rowFor(derive(), 'FT-1').lessons.map((l) => l.id), ['L-ft1-a', 'L-ft1-t']);
check('no filters: availability is attached per teacher',
  fmt(rowFor(derive(), 'PT-1').availability), ['14:00-18:00']);
check('a teacher with no availability row still gets a row',
  rowFor(derive(), 'NOWIN').availability, []);

console.log('='.repeat(78));
console.log('A · SHIFT / ROSTER GROUP FILTER (shiftTemplateIds)');
console.log('='.repeat(78));

check('A  Full-time alone → only full-time teachers',
  teacherIdsOf(derive({ shiftTemplateIds: [FULL_TPL.id] })), ['FT-1', 'FT-2', 'FT-3']);
check('A  Part-time alone → only part-time teachers',
  teacherIdsOf(derive({ shiftTemplateIds: [PART_TPL.id] })), ['PT-1', 'PT-2', 'NOWIN']);
check('A  Full-time + Part-time → OR, i.e. everyone on the roster',
  teacherIdsOf(derive({ shiftTemplateIds: [FULL_TPL.id, PART_TPL.id] })),
  ['FT-1', 'FT-2', 'FT-3', 'PT-1', 'PT-2', 'NOWIN']);
check('A  no shift selected means "no restriction", not "nothing"',
  teacherIdsOf(derive({ shiftTemplateIds: [] })).length, 6);
check('A  an unknown template id matches nobody (zero-result state)',
  teacherIdsOf(derive({ shiftTemplateIds: ['tpl-does-not-exist'] })), []);
check('A  the group filter keeps the matching teachers\' lessons intact',
  lessonIdsOf(derive({ shiftTemplateIds: [FULL_TPL.id] })).sort(),
  ['L-ft1-a', 'L-ft1-t', 'L-ft2-all']);
// The point of using the template id rather than teacherType: teacherType
// cannot tell one shift group from another, because every roster teacher is
// 'shift'. If it could, this assertion would not need to exist.
check('A  teacherType cannot separate the groups (why shiftTemplateIds exists)',
  [...new Set(ROSTER_TEACHERS.map((t) => t.teacherType))], ['shift']);
check('A  a renamed/re-timed group still filters (identity is the id, not the name)',
  teacherIdsOf(deriveScheduleRows({
    rosterTeachers: buildScheduleRoster(
      [{ ...FULL_TPL, name: 'Morning crew', startMinute: 11 * 60 }, PART_TPL], ASSIGNMENTS, TEACHERS
    ).flatMap((g) => g.teachers),
    lessons: LESSONS, availability: AVAILABILITY,
    supervisorIdByStudentId: SUPERVISOR_BY_STUDENT, studentNameById: NAME_BY_STUDENT,
    templateIdsByTeacherId: TEMPLATE_IDS_BY_TEACHER,
    filters: { ...DEFAULTS, shiftTemplateIds: [FULL_TPL.id] }, searchQuery: '',
  })), ['FT-1', 'FT-2', 'FT-3']);

console.log('='.repeat(78));
console.log('B · SUPERVISOR FILTER (supervisorIds — the existing field)');
console.log('='.repeat(78));

check('B  one supervisor → only that supervisor\'s lessons are drawn',
  lessonIdsOf(derive({ supervisorIds: [DINA] })).sort(),
  ['L-ft1-a', 'L-ft2-all', 'L-nowin', 'L-pt1-out']);
check('B  two supervisors OR together',
  lessonIdsOf(derive({ supervisorIds: [DINA, ZAINAB] })).sort(),
  ['L-ft1-a', 'L-ft1-t', 'L-ft2-all', 'L-nowin', 'L-pt1-out', 'L-pt2-out']);
check('B  a supervisor with no lessons today draws none',
  lessonIdsOf(derive({ supervisorIds: ['sup-nobody'] })), []);
check('B  a student with no supervisor is never matched by a supervisor filter',
  lessonIdsOf(derive({ supervisorIds: [DINA, ZAINAB, REHAB] })).includes('L-none'), false);
// A lesson-level filter NARROWS THE SCHEDULE. Clicking a supervisor answers
// "show me this supervisor's schedule", so a teacher with none of their
// lessons is not part of the answer and their row goes away. The previous
// behaviour kept all 14 rows with one filled in, which read as "the filter
// did nothing".
check('B  a supervisor filter drops rows with none of their lessons',
  teacherIdsOf(derive({ supervisorIds: [REHAB] })), ['PT-1']);
check('B  …and the surviving row carries only their lessons',
  rowFor(derive({ supervisorIds: [REHAB] }), 'PT-1').lessons.map((l) => l.id), ['L-pt1-in']);
check('B  a supervisor with no lessons today leaves no rows at all',
  teacherIdsOf(derive({ supervisorIds: ['sup-nobody'] })), []);
check('B  two supervisors OR at row level too',
  teacherIdsOf(derive({ supervisorIds: [DINA, ZAINAB] })), ['FT-1', 'FT-2', 'PT-1', 'PT-2', 'NOWIN']);

console.log('='.repeat(78));
console.log('C · LESSON LIFECYCLE FILTER (lifecycleStatuses — the existing field)');
console.log('='.repeat(78));

check('C  Trial → only trial lessons', lessonIdsOf(derive({ lifecycleStatuses: ['trial'] })), ['L-ft1-t']);
check('C  Trial → only the rows holding one', teacherIdsOf(derive({ lifecycleStatuses: ['trial'] })), ['FT-1']);
check('C  Active → only the rows holding one',
  teacherIdsOf(derive({ lifecycleStatuses: ['active'] })), ['FT-1', 'FT-2', 'PT-1', 'PT-2', 'NOWIN']);
check('C  a status nothing holds today leaves no rows',
  teacherIdsOf(derive({ lifecycleStatuses: ['paused'] })), []);
check('C  Active → only active lessons', lessonIdsOf(derive({ lifecycleStatuses: ['active'] })).sort(),
  ['L-ft1-a', 'L-ft2-all', 'L-nowin', 'L-pt1-in', 'L-pt1-out', 'L-pt2-out']);
check('C  Trial + Active OR together',
  lessonIdsOf(derive({ lifecycleStatuses: ['trial', 'active'] })).length, 7);
check('C  a status nothing holds today draws no lessons',
  lessonIdsOf(derive({ lifecycleStatuses: ['paused'] })), []);
check('C  Trial + Active for the SAME teacher keeps both',
  rowFor(derive({ lifecycleStatuses: ['trial', 'active'] }), 'FT-1').lessons.map((l) => l.id),
  ['L-ft1-a', 'L-ft1-t']);

console.log('='.repeat(78));
console.log('D · FREE TIME (availableOnly) — THE BUG THIS REPLACES');
console.log('='.repeat(78));

{
  const rows = derive({ availableOnly: true });
  check('D  FT-1 (13:00 + 15:00 booked inside 12-19) has free capacity',
    teacherIdsOf(rows).includes('FT-1'), true);
  check('D  FT-3 (on shift, no lessons at all) has free capacity',
    teacherIdsOf(rows).includes('FT-3'), true);
  check('D  FT-2 (12:00-19:00 solid booking) is DROPPED — no free capacity',
    teacherIdsOf(rows).includes('FT-2'), false);
  check('D  NOWIN (no availability configured) is DROPPED, not shown wide open',
    teacherIdsOf(rows).includes('NOWIN'), false);
  check('D  PT-2 (only lesson is outside 14-18) still has free capacity inside it',
    teacherIdsOf(rows).includes('PT-2'), true);
  check('D  exactly the teachers with real unsold capacity survive',
    teacherIdsOf(rows), ['FT-1', 'FT-3', 'PT-1', 'PT-2']);

  // The old implementation's signature failure: it set teacherLessons = [].
  check('D  lessons are NOT emptied (the old `teacherLessons = []` bug)',
    rowFor(rows, 'FT-1').lessons.map((l) => l.id), ['L-ft1-a', 'L-ft1-t']);
  check('D  occupancy still records both booked blocks',
    fmt(rowFor(rows, 'FT-1').occupancy), ['13:00-14:00', '15:00-16:00']);
  check('D  so the row reports only the GAPS as free, not the whole shift',
    fmt(computeRowLayout(rowFor(rows, 'FT-1').lessons, rowFor(rows, 'FT-1').availability,
      rowFor(rows, 'FT-1').occupancy).freeIntervals),
    ['12:00-13:00', '14:00-15:00', '16:00-19:00']);
  check('D  a fully-booked teacher would have reported 7h free under the old bug',
    fmt(computeRowLayout([], AVAILABILITY.filter((a) => a.teacherId === 'FT-2')).freeIntervals),
    ['12:00-19:00']);
  check('D  …and reports nothing free once real occupancy is used',
    computeRowLayout([], AVAILABILITY.filter((a) => a.teacherId === 'FT-2'),
      [{ startMinute: 12 * 60, endMinute: 19 * 60 }]).freeIntervals, []);
  check('D  free capacity never leaks outside the working window (PT-1)',
    fmt(computeRowLayout(rowFor(rows, 'PT-1').lessons, rowFor(rows, 'PT-1').availability,
      rowFor(rows, 'PT-1').occupancy).freeIntervals),
    ['15:00-18:00']);
  check('D  availability is left exactly as configured',
    fmt(rowFor(rows, 'PT-1').availability), ['14:00-18:00']);
}

console.log('='.repeat(78));
console.log('D2 · FILTERING MUST NEVER INVENT FREE CAPACITY');
console.log('='.repeat(78));

{
  // Hide FT-1's active lesson by filtering to Trial. Its minutes are still
  // sold, so 13:00-14:00 must NOT turn into a red free band.
  const row = rowFor(derive({ lifecycleStatuses: ['trial'] }), 'FT-1');
  check('D2 filtering to Trial hides the active lesson from the row',
    row.lessons.map((l) => l.id), ['L-ft1-t']);
  check('D2 …but occupancy still covers it',
    fmt(row.occupancy), ['13:00-14:00', '15:00-16:00']);
  check('D2 …so the free bands are unchanged by the filter',
    fmt(computeRowLayout(row.lessons, row.availability, row.occupancy).freeIntervals),
    ['12:00-13:00', '14:00-15:00', '16:00-19:00']);
  check('D2 (without occupancy the hidden lesson WOULD read as free — the trap)',
    fmt(computeRowLayout(row.lessons, row.availability).freeIntervals),
    ['12:00-15:00', '16:00-19:00']);

  // PT-1 survives a REHAB filter with only one of their two lessons visible.
  // Occupancy must still cover BOTH, or the hidden 19:00 lesson's minutes
  // would be repainted as free capacity.
  const supRow = rowFor(derive({ supervisorIds: [REHAB] }), 'PT-1');
  check('D2 a supervisor filter hides a lesson without freeing its minutes',
    [supRow.lessons.map((l) => l.id), fmt(supRow.occupancy)],
    [['L-pt1-in'], ['14:00-15:00', '19:00-20:00']]);
  check('D2 …so the free bands are what they were before the filter',
    fmt(computeRowLayout(supRow.lessons, supRow.availability, supRow.occupancy).freeIntervals),
    fmt(computeRowLayout(rowFor(derive(), 'PT-1').lessons, rowFor(derive(), 'PT-1').availability,
      rowFor(derive(), 'PT-1').occupancy).freeIntervals));
}

console.log('='.repeat(78));
console.log('E · OUTSIDE SHIFT (outsideShiftOnly)');
console.log('='.repeat(78));

{
  const rows = derive({ outsideShiftOnly: true });
  check('E  only teachers with a lesson outside their own window survive',
    teacherIdsOf(rows), ['PT-1', 'PT-2']);
  check('E  PT-1 shows ONLY the 19:00 lesson (14:00 one is inside the shift)',
    rowFor(rows, 'PT-1').lessons.map((l) => l.id), ['L-pt1-out']);
  check('E  PT-2\'s 10:00 lesson is outside 14:00-18:00',
    rowFor(rows, 'PT-2').lessons.map((l) => l.id), ['L-pt2-out']);
  check('E  FT-1, whose lessons are all inside 12:00-19:00, is dropped',
    teacherIdsOf(rows).includes('FT-1'), false);
  check('E  a teacher with NO configured window has no shift to be outside of',
    teacherIdsOf(rows).includes('NOWIN'), false);
  check('E  availability is untouched by the filter',
    fmt(rowFor(rows, 'PT-1').availability), ['14:00-18:00']);
  check('E  occupancy still holds BOTH of PT-1\'s lessons',
    fmt(rowFor(rows, 'PT-1').occupancy), ['14:00-15:00', '19:00-20:00']);

  // Outside-shift is the teacher's own window, not the viewport: the same
  // 19:00 lesson is INSIDE a 12:00-19:30 window.
  const widened = deriveScheduleRows({
    rosterTeachers: ROSTER_TEACHERS, lessons: LESSONS,
    availability: [...AVAILABILITY.filter((a) => a.teacherId !== 'PT-1'), slot('PT-1', 12 * 60, 20 * 60)],
    supervisorIdByStudentId: SUPERVISOR_BY_STUDENT, studentNameById: NAME_BY_STUDENT,
    templateIdsByTeacherId: TEMPLATE_IDS_BY_TEACHER,
    filters: { ...DEFAULTS, outsideShiftOnly: true }, searchQuery: '',
  });
  check('E  widening PT-1\'s window removes them from "outside shift"',
    teacherIdsOf(widened), ['PT-2']);
}

console.log('='.repeat(78));
console.log('F · FREE TIME AND OUTSIDE SHIFT ARE NOT LESSON-STATUS FILTERS');
console.log('='.repeat(78));

check('F  free time leaves every lifecycle status alone',
  [...new Set(derive({ availableOnly: true }).flatMap((r) => r.lessons.map((l) => l.lifecycleStatus)))].sort(),
  ['active', 'trial']);
// Free time AND Trial: a row must have real unsold capacity AND a trial
// lesson. FT-3 has capacity but no trial, so it is no longer an answer.
check('F  free time + Trial: capacity AND a trial lesson',
  derive({ availableOnly: true, lifecycleStatuses: ['trial'] }).map((r) => [r.teacher.id, r.lessons.map((l) => l.id)]),
  [['FT-1', ['L-ft1-t']]]);
check('F  free time ALONE still keeps a teacher with no lessons at all',
  teacherIdsOf(derive({ availableOnly: true })).includes('FT-3'), true);
check('F  outside shift + free time AND together',
  teacherIdsOf(derive({ availableOnly: true, outsideShiftOnly: true })), ['PT-1', 'PT-2']);
check('F  outside shift + free time on a fully-booked window → nothing',
  teacherIdsOf(derive({ availableOnly: true, outsideShiftOnly: true },
    '', [lesson('X', 'PT-1', 14 * 60, { durationMinutes: 4 * 60 }), lesson('Y', 'PT-1', 19 * 60)])),
  []);

console.log('='.repeat(78));
console.log('G · AND ACROSS CATEGORIES, OR WITHIN ONE');
console.log('='.repeat(78));

// The brief's worked example: Full-time + Dina + Trial.
{
  const rows = derive({ shiftTemplateIds: [FULL_TPL.id], supervisorIds: [DINA], lifecycleStatuses: ['trial'] });
  check('G  Full-time + Dina + Trial → no lesson is both, so no rows',
    teacherIdsOf(rows), []);
  check('G  …and nothing is drawn', lessonIdsOf(rows), []);
}
check('G  Full-time + Zainab + Trial → the one lesson that is both',
  lessonIdsOf(derive({ shiftTemplateIds: [FULL_TPL.id], supervisorIds: [ZAINAB], lifecycleStatuses: ['trial'] })),
  ['L-ft1-t']);
check('G  Dina OR Zainab, ANDed with Trial, is not a global OR',
  lessonIdsOf(derive({ supervisorIds: [DINA, ZAINAB], lifecycleStatuses: ['trial'] })), ['L-ft1-t']);
check('G  Part-time + Dina → part-time rows that actually hold a Dina lesson',
  derive({ shiftTemplateIds: [PART_TPL.id], supervisorIds: [DINA] })
    .map((r) => [r.teacher.id, r.lessons.map((l) => l.id)]),
  [['PT-1', ['L-pt1-out']], ['NOWIN', ['L-nowin']]]);
check('G  Full-time + free time',
  teacherIdsOf(derive({ shiftTemplateIds: [FULL_TPL.id], availableOnly: true })), ['FT-1', 'FT-3']);
check('G  Part-time + outside shift',
  teacherIdsOf(derive({ shiftTemplateIds: [PART_TPL.id], outsideShiftOnly: true })), ['PT-1', 'PT-2']);
check('G  Full-time + outside shift → zero results (no full-timer is outside)',
  teacherIdsOf(derive({ shiftTemplateIds: [FULL_TPL.id], outsideShiftOnly: true })), []);

console.log('='.repeat(78));
console.log('H · LEGEND FILTERS COMBINE WITH SEARCH AND THE EXISTING FILTERS');
console.log('='.repeat(78));

check('H  search alone matches on teacher name',
  teacherIdsOf(derive({}, 'arwa')), ['FT-1']);
check('H  search alone matches on student name',
  teacherIdsOf(derive({}, 'layla')), ['PT-1']);
check('H  search + Full-time: AND',
  teacherIdsOf(derive({ shiftTemplateIds: [FULL_TPL.id] }, 'aya')), []);
check('H  search + Part-time: AND',
  teacherIdsOf(derive({ shiftTemplateIds: [PART_TPL.id] }, 'aya')), ['PT-1']);
check('H  search + free time',
  teacherIdsOf(derive({ availableOnly: true }, 'doaa')), []);
check('H  search is applied to the FILTERED lessons (Trial hides a student match)',
  teacherIdsOf(derive({ lifecycleStatuses: ['active'] }, 'omar')), ['PT-2']);
check('H  search is case- and whitespace-insensitive',
  teacherIdsOf(derive({}, '  ARWA  ')), ['FT-1']);
check('H  existing teacherIds filter + Full-time legend',
  teacherIdsOf(derive({ teacherIds: ['FT-2', 'PT-1'], shiftTemplateIds: [FULL_TPL.id] })), ['FT-2']);
check('H  existing studentIds filter + Trial legend',
  lessonIdsOf(derive({ studentIds: ['S-z1'], lifecycleStatuses: ['trial'] })), ['L-ft1-t']);
check('H  existing primeTimeOnly + supervisor legend (19:00 is outside prime time)',
  lessonIdsOf(derive({ primeTimeOnly: true, supervisorIds: [DINA] })).sort(),
  ['L-ft1-a', 'L-ft2-all', 'L-nowin']);
// NOWIN's 15:00 lesson is in range, but NOWIN has no window so free time
// drops the whole row — the two categories really do AND.
check('H  existing time range + free time legend',
  lessonIdsOf(derive({ timeRangeStart: 15 * 60, availableOnly: true })).sort(),
  ['L-ft1-t', 'L-pt1-out']);
check('H  existing coursePendingOnly + Full-time legend',
  lessonIdsOf(derive({ coursePendingOnly: true, shiftTemplateIds: [FULL_TPL.id] })).sort(),
  ['L-ft1-a', 'L-ft1-t', 'L-ft2-all']);
check('H  existing groupFilter + supervisor legend (all fixtures are 1:1)',
  lessonIdsOf(derive({ groupFilter: 'group', supervisorIds: [DINA] })), []);
check('H  existing teacherType + Full-time legend still ANDs',
  teacherIdsOf(derive({ teacherType: 'hourly', shiftTemplateIds: [FULL_TPL.id] })), []);

console.log('='.repeat(78));
console.log('I · OCCURRENCE EXCEPTIONS FEED THE FILTERS');
console.log('='.repeat(78));

{
  const cancelled = applyOccurrenceExceptions(LESSONS, [
    { lessonId: 'L-ft2-all', status: 'cancelled', overrideTeacherId: null, overrideStartMinute: null, overrideDurationMinutes: null },
  ]);
  check('I  a cancelled occurrence is gone for the day', cancelled.some((l) => l.id === 'L-ft2-all'), false);
  check('I  …so the fully-booked teacher now HAS free capacity',
    teacherIdsOf(derive({ availableOnly: true }, '', cancelled)).includes('FT-2'), true);
  check('I  …and reports the whole window free',
    fmt(computeRowLayout([], AVAILABILITY.filter((a) => a.teacherId === 'FT-2'),
      rowFor(derive({}, '', cancelled), 'FT-2').occupancy).freeIntervals), ['12:00-19:00']);

  const moved = applyOccurrenceExceptions(LESSONS, [
    { lessonId: 'L-pt1-out', status: 'rescheduled', overrideTeacherId: null, overrideStartMinute: 16 * 60, overrideDurationMinutes: null },
  ]);
  check('I  a reschedule into the window removes PT-1 from "outside shift"',
    teacherIdsOf(derive({ outsideShiftOnly: true }, '', moved)), ['PT-2']);
  check('I  a reschedule onto another teacher moves the lesson\'s row',
    rowFor(derive({}, '', applyOccurrenceExceptions(LESSONS, [
      { lessonId: 'L-pt1-out', status: 'rescheduled', overrideTeacherId: 'FT-3', overrideStartMinute: null, overrideDurationMinutes: null },
    ])), 'FT-3').lessons.map((l) => l.id), ['L-pt1-out']);
  check('I  applyOccurrenceExceptions does not mutate the source array',
    LESSONS.length, 7);
  check('I  …nor the lesson objects it rewrites',
    LESSONS.find((l) => l.id === 'L-pt1-out').startMinute, 19 * 60);
  check('I  no exceptions returns the same array reference (cheap no-op)',
    applyOccurrenceExceptions(LESSONS, []) === LESSONS, true);
}

console.log('='.repeat(78));
console.log('J · EDGE CASES');
console.log('='.repeat(78));

check('J  teacher with no lessons but available time survives free time',
  teacherIdsOf(derive({ availableOnly: true })).includes('FT-3'), true);
check('J  teacher with no availability is dropped by free time',
  teacherIdsOf(derive({ availableOnly: true })).includes('NOWIN'), false);
check('J  teacher with no availability is dropped by outside shift',
  teacherIdsOf(derive({ outsideShiftOnly: true })).includes('NOWIN'), false);
check('J  teacher with no availability is otherwise unaffected',
  rowFor(derive(), 'NOWIN').lessons.map((l) => l.id), ['L-nowin']);
check('J  an empty roster yields no rows',
  deriveScheduleRows({
    rosterTeachers: [], lessons: LESSONS, availability: AVAILABILITY,
    supervisorIdByStudentId: SUPERVISOR_BY_STUDENT, studentNameById: NAME_BY_STUDENT,
    templateIdsByTeacherId: TEMPLATE_IDS_BY_TEACHER, filters: DEFAULTS, searchQuery: '',
  }), []);
check('J  an empty day still yields every row, with empty lessons/occupancy',
  derive({}, '', []).map((r) => [r.teacher.id, r.lessons.length, r.occupancy.length]),
  [['FT-1', 0, 0], ['FT-2', 0, 0], ['FT-3', 0, 0], ['PT-1', 0, 0], ['PT-2', 0, 0], ['NOWIN', 0, 0]]);
check('J  an empty day + free time keeps everyone who has a window',
  teacherIdsOf(derive({ availableOnly: true }, '', [])), ['FT-1', 'FT-2', 'FT-3', 'PT-1', 'PT-2']);
check('J  an empty day + outside shift matches nobody',
  teacherIdsOf(derive({ outsideShiftOnly: true }, '', [])), []);
check('J  the source lesson array is never reordered or mutated',
  LESSONS.map((l) => l.id), ['L-ft1-a', 'L-ft1-t', 'L-ft2-all', 'L-pt1-in', 'L-pt1-out', 'L-pt2-out', 'L-nowin']);
check('J  rows are fresh objects — nothing is aliased back into the inputs',
  derive()[0].lessons === LESSONS, false);

// Switching days: the pipeline is a pure function of the day's data, so the
// same active filters applied to a different day's lessons just re-derive.
{
  const otherDay = [lesson('L-mon', 'FT-2', 13 * 60, { students: ['S-d1'] })];
  // Same active filters, a different day's lessons: only the teacher who has
  // a Dina lesson that day AND free capacity survives.
  check('J  switching days re-derives under the same active filters',
    derive({ availableOnly: true, supervisorIds: [DINA] }, '', otherDay)
      .map((r) => [r.teacher.id, r.lessons.map((l) => l.id)]),
    [['FT-2', ['L-mon']]]);
}

// A teacher assigned to two templates matches either — OR within the category.
{
  const both = [...ASSIGNMENTS, assign('FT-1', PART_TPL.id)];
  const roster = buildScheduleRoster([FULL_TPL, PART_TPL], both, TEACHERS);
  const map = new Map();
  for (const g of roster) for (const t of g.teachers) map.set(t.id, [...(map.get(t.id) ?? []), g.templateId]);
  check('J  a teacher in two groups is matched by either group filter',
    [map.get('FT-1').length,
     map.get('FT-1').some((id) => id === FULL_TPL.id),
     map.get('FT-1').some((id) => id === PART_TPL.id)],
    [2, true, true]);
}

console.log('\n' + results.join('\n'));
console.log('\n' + '='.repeat(78));
console.log(`TOTAL: ${pass} passed, ${fail} failed`);
console.log('='.repeat(78));
process.exit(fail === 0 ? 0 : 1);

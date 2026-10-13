/**
 * Schedule roster rules, proven from availability configuration alone.
 *
 * Fixtures mirror the approved production configuration (14 teachers, two
 * groups) but are defined here — no database, no production lesson records.
 * The point is that roster membership and working windows are derived from
 * shift templates + assignments, never hardcoded in the UI.
 */
import { buildScheduleRoster, buildScheduleRosterWithDiagnostics, HOURLY_GROUP_ID, rosterGroupWindowLabel } from './buildScheduleRoster.mjs';
import { deriveScheduleRows } from './deriveScheduleRows.mjs';
import { computeRowLayout } from './computeRowLayout.mjs';
import { minuteToX, timelineWidth } from './timelineGeometry.mjs';
import { GRID_START_MINUTE, GRID_COLUMNS } from './schedulingConstants.mjs';

let pass = 0, fail = 0;
const results = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}` +
    (ok ? '' : `\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`));
}
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const fmt = (l) => l.map((i) => `${hhmm(i.startMinute)}-${hhmm(i.endMinute)}`);

// --- fixtures: the approved roster, by the same UUIDs production uses ----
const FULL_TPL = { id: 'tpl-full', branchId: null, name: 'Full-time', startMinute: 720, endMinute: 1140, timezone: 'Asia/Dubai', isActive: true, createdAt: '', updatedAt: '' };
const PART_TPL = { id: 'tpl-part', branchId: null, name: 'Part-time', startMinute: 840, endMinute: 1080, timezone: 'Asia/Dubai', isActive: true, createdAt: '', updatedAt: '' };

const FULL = [
  ['1be38a96-e963-4fce-84a8-7fecd0857195', 'Mohamed Hussein '],
  ['51042bab-879f-469b-b738-ea4f35072e23', 'Ashraf Elzohdy'],
  ['31f8b40b-c0ab-4765-a444-df95585fbc54', 'Arwa Ahmed '],
  ['e814f138-9940-4f86-b78b-2e4e2908cfa9', 'Menna Ramadan'],
  ['3fd381c5-c34b-46cf-b28f-a55cf4634142', 'Rokaya Ramadan'],
  ['e93d453e-5282-4dc9-9e33-f3a77a0efd8a', 'Hend Mohammed '],
  ['14d7a6d9-749b-44a0-9a52-1a76611066cb', 'Doaa Zakaria '],
  ['686c57da-78d7-4a9d-abf4-b35c1b8e8faa', 'Yasmeen Saad'],
];
const PART = [
  ['0b9d761d-520d-46b5-9889-eb24225be3e8', 'Aya Mustafa '],
  ['291905ec-b1b5-4506-8b8e-3edb4e319357', 'Zainab Hazem'],
  ['703abfe6-3007-49d8-ac22-c68033f855bc', 'Menna Ebrahim '],
  ['9a8210de-a691-44bf-8b6e-c2f15380986a', 'Ghada '],
  ['cba57876-b992-4050-95f8-07972b1c8572', 'Asmaa Magdy'],
  ['c8c51712-35b1-4b09-ba3f-fbb9bca78405', 'Yasmin Asaad'],
];
// Deliberately NOT on the roster: the duplicate Hend record and four
// unrelated teachers that the production selector used to offer.
const OFF_ROSTER = [
  ['b9802a91-b3cc-444a-9150-5d7b3d431504', 'Hend Mohammed (اعاجم) '],
  ['off-1', 'Fatma English '],
  ['off-2', 'Basant Sayed'],
  ['off-3', 'Rehab Gomaa'],
  ['off-4', 'Dina Samir'],
];

const teacher = ([id, fullName]) => ({ id, fullName, isDeleted: false, teacherType: 'shift' });
const TEACHERS = [...FULL, ...PART, ...OFF_ROSTER].map(teacher);

const DAYS = [0, 1, 2, 3, 4, 5, 6];
const assignmentsFor = (rows, templateId) =>
  rows.flatMap(([id]) => DAYS.map((d) => ({
    id: `${id}-${d}`, teacherId: id, shiftTemplateId: templateId, dayOfWeek: d,
    isActive: true, createdAt: '', updatedAt: '',
  })));
const ASSIGNMENTS = [...assignmentsFor(FULL, FULL_TPL.id), ...assignmentsFor(PART, PART_TPL.id)];

const roster = buildScheduleRoster([FULL_TPL, PART_TPL], ASSIGNMENTS, TEACHERS);
const flat = roster.flatMap((g) => g.teachers);
const names = (g) => g.teachers.map((t) => t.fullName.trim());

console.log('='.repeat(78));
console.log('A-E · ROSTER SHAPE AND WINDOWS');
console.log('='.repeat(78));

check('A  roster has exactly 14 teachers', flat.length, 14);
check('A  roster has exactly 2 groups', roster.length, 2);
check('B  8 full-time teachers', roster[0].teachers.length, 8);
check('C  6 part-time teachers', roster[1].teachers.length, 6);
check('D  full-time window = 12:00-19:00', `${hhmm(roster[0].startMinute)}-${hhmm(roster[0].endMinute)}`, '12:00-19:00');
check('D  full-time window in minutes = 720-1140', [roster[0].startMinute, roster[0].endMinute], [720, 1140]);
check('E  part-time window = 14:00-18:00', `${hhmm(roster[1].startMinute)}-${hhmm(roster[1].endMinute)}`, '14:00-18:00');
check('E  part-time window in minutes = 840-1080', [roster[1].startMinute, roster[1].endMinute], [840, 1080]);
check('   full-time group leads (earlier start sorts first)', [roster[0].name, roster[1].name], ['Full-time', 'Part-time']);
check('   group labels come from the template name', roster.map((g) => g.name), ['Full-time', 'Part-time']);

console.log('='.repeat(78));
console.log('F-K · MEMBERSHIP');
console.log('='.repeat(78));

check('F  Ghada is on the roster', names(roster[1]).includes('Ghada'), true);
check('F  Ghada is in the PART-TIME group', roster[1].teachers.some((t) => t.id === '9a8210de-a691-44bf-8b6e-c2f15380986a'), true);
for (const [label, needle] of [['G', 'Fatma'], ['H', 'Basant'], ['I', 'Rehab'], ['J', 'Dina']]) {
  check(`${label}  ${needle} is NOT on the roster`, flat.some((t) => t.fullName.includes(needle)), false);
}
check('K  the duplicate "Hend Mohammed (اعاجم)" is NOT on the roster',
  flat.some((t) => t.id === 'b9802a91-b3cc-444a-9150-5d7b3d431504'), false);
check('K  the approved plain "Hend Mohammed" IS on the roster',
  roster[0].teachers.some((t) => t.id === 'e93d453e-5282-4dc9-9e33-f3a77a0efd8a'), true);
check('   approved business order preserved (full-time)', names(roster[0]),
  ['Mohamed Hussein', 'Ashraf Elzohdy', 'Arwa Ahmed', 'Menna Ramadan', 'Rokaya Ramadan', 'Hend Mohammed', 'Doaa Zakaria', 'Yasmeen Saad']);
check('   approved business order preserved (part-time)', names(roster[1]),
  ['Aya Mustafa', 'Zainab Hazem', 'Menna Ebrahim', 'Ghada', 'Asmaa Magdy', 'Yasmin Asaad']);

console.log('='.repeat(78));
console.log('L-M · FREE CAPACITY ON AN EMPTY SCHEDULE');
console.log('='.repeat(78));

const slot = (g) => [{ teacherId: 'T', dayOfWeek: 0, startMinute: g.startMinute, endMinute: g.endMinute, timezone: 'Asia/Dubai', source: 'shift' }];

{
  const full = computeRowLayout([], slot(roster[0]));
  check('L  empty full-time day = one contiguous 12:00-19:00 free band', fmt(full.freeIntervals), ['12:00-19:00']);
  check('L  full-time free minutes = 7h', full.freeIntervals.reduce((n, i) => n + (i.endMinute - i.startMinute), 0), 420);
  check('L  full-time in-window columns = 14 (7h / 30min)', full.columnInWindow.filter(Boolean).length, 14);
  check('M  nothing free before 12:00', full.freeIntervals.some((i) => i.startMinute < 720), false);
  check('M  nothing free after 19:00', full.freeIntervals.some((i) => i.endMinute > 1140), false);
  check('M  11:30 column is outside the full-time window', full.columnInWindow[(11 * 60 + 30 - GRID_START_MINUTE) / 30], false);
  check('M  12:00 column is inside the full-time window', full.columnInWindow[(720 - GRID_START_MINUTE) / 30], true);

  const part = computeRowLayout([], slot(roster[1]));
  check('L  empty part-time day = one contiguous 14:00-18:00 free band', fmt(part.freeIntervals), ['14:00-18:00']);
  check('L  part-time free minutes = 4h', part.freeIntervals.reduce((n, i) => n + (i.endMinute - i.startMinute), 0), 240);
  check('M  part-time: nothing free after 18:00', part.freeIntervals.some((i) => i.endMinute > 1080), false);
  check('M  part-time: 18:00 column outside the window', part.columnInWindow[(1080 - GRID_START_MINUTE) / 30], false);
  check('M  part-time: 12:00 column outside the window (full-time hours only)', part.columnInWindow[(720 - GRID_START_MINUTE) / 30], false);
}

// A lesson still subtracts exactly its own interval from the wider window.
{
  const lesson = { id: 'L', teacherId: 'T', dayOfWeek: 0, startMinute: 12 * 60, durationMinutes: 40, endMinute: 12 * 60 + 40, participants: [] };
  const layout = computeRowLayout([lesson], slot(roster[0]));
  check('   12:00 + 40min booking leaves 12:40-19:00 free', fmt(layout.freeIntervals), ['12:40-19:00']);
  check('   it removes exactly 40 minutes of capacity',
    420 - layout.freeIntervals.reduce((n, i) => n + (i.endMinute - i.startMinute), 0), 40);
}

console.log('='.repeat(78));
console.log('N · NEW BOUNDARIES FLOW THROUGH THE CANONICAL GEOMETRY');
console.log('='.repeat(78));

for (const columnWidth of [40, 61, 96]) {
  const x = (m) => ((m - GRID_START_MINUTE) * columnWidth) / 30;  // relative to the configured axis origin
  for (const [label, minute] of [['12:00', 720], ['14:00', 840], ['18:00', 1080], ['19:00', 1140]]) {
    check(`N  cw=${columnWidth}: ${label} resolves to its exact column boundary`, minuteToX(minute, columnWidth), x(minute));
  }
  check(`N  cw=${columnWidth}: timelineWidth spans the ${GRID_COLUMNS.length}-column axis`, timelineWidth(columnWidth), GRID_COLUMNS.length * columnWidth);
}

// Future re-configuration: an arbitrary new window must need no code change.
for (const [start, end, label] of [[660, 1140, '11:00-19:00'], [720, 1200, '12:00-20:00'], [780, 1140, '13:00-19:00'], [900, 1200, '15:00-20:00']]) {
  const layout = computeRowLayout([], [{ teacherId: 'T', dayOfWeek: 0, startMinute: start, endMinute: end, timezone: 'Asia/Dubai', source: 'shift' }]);
  check(`N  re-configured window ${label} works with no code change`, fmt(layout.freeIntervals), [label]);
  check(`N  ${label}: in-window column count`, layout.columnInWindow.filter(Boolean).length, (end - start) / 30);
}

console.log('='.repeat(78));
console.log('DATA-DRIVEN GUARANTEES');
console.log('='.repeat(78));

check('an inactive template contributes no group',
  buildScheduleRoster([{ ...FULL_TPL, isActive: false }, PART_TPL], ASSIGNMENTS, TEACHERS).length, 1);
check('deactivating an assignment removes that teacher from the roster',
  buildScheduleRoster([FULL_TPL, PART_TPL],
    ASSIGNMENTS.map((a) => (a.teacherId === '686c57da-78d7-4a9d-abf4-b35c1b8e8faa' ? { ...a, isActive: false } : a)),
    TEACHERS).flatMap((g) => g.teachers).length, 13);
check('a soft-deleted teacher drops off the roster',
  buildScheduleRoster([FULL_TPL, PART_TPL], ASSIGNMENTS,
    TEACHERS.map((t) => (t.id === '686c57da-78d7-4a9d-abf4-b35c1b8e8faa' ? { ...t, isDeleted: true } : t))
  ).flatMap((g) => g.teachers).length, 13);
check('a teacher missing from the display-order list still appears (sorted last)',
  buildScheduleRoster([FULL_TPL], [...assignmentsFor(FULL, FULL_TPL.id),
    ...DAYS.map((d) => ({ id: `nw-${d}`, teacherId: 'newcomer', shiftTemplateId: FULL_TPL.id, dayOfWeek: d, isActive: true, createdAt: '', updatedAt: '' }))],
    [...TEACHERS, { id: 'newcomer', fullName: 'Aaaa Newcomer', isDeleted: false, teacherType: 'shift' }]
  )[0].teachers.map((t) => t.fullName.trim()).slice(-1), ['Aaaa Newcomer']);
check('no templates or no assignments yields an empty roster', buildScheduleRoster([], [], TEACHERS), []);

console.log('='.repeat(78));
console.log('O-T · HOURLY GROUP (no shift assignment, booked lessons, no window)');
console.log('='.repeat(78));

{
  // Two hourly teachers with booked lessons, one hourly teacher with none, one
  // roster teacher who ALSO has lessons (must stay in their shift group only),
  // and a soft-deleted hourly teacher with lessons (never shown).
  const HOURLY_A = { id: 'h-anan', fullName: 'Mohamed Anan', isDeleted: false, teacherType: 'hourly' };
  const HOURLY_B = { id: 'h-amal', fullName: 'Amal Monir', isDeleted: false, teacherType: 'hourly' };
  const HOURLY_IDLE = { id: 'h-idle', fullName: 'Idle Hourly', isDeleted: false, teacherType: 'hourly' };
  const HOURLY_DELETED = { id: 'h-del', fullName: 'Deleted Hourly', isDeleted: true, teacherType: 'hourly' };
  const all = [...TEACHERS, HOURLY_A, HOURLY_B, HOURLY_IDLE, HOURLY_DELETED];
  const scheduled = new Set(['h-anan', 'h-amal', 'h-del', '1be38a96-e963-4fce-84a8-7fecd0857195']);
  const withHourly = buildScheduleRoster([FULL_TPL, PART_TPL], ASSIGNMENTS, all, scheduled);

  check('O  a third group is added after the shift groups', withHourly.map((g) => g.kind), ['shift', 'shift', 'hourly']);
  check('O  the Hourly group has its own stable id', withHourly[2].templateId, HOURLY_GROUP_ID);
  check('P  hourly members are the scheduled, non-roster, non-deleted teachers (by name)',
    withHourly[2].teachers.map((t) => t.fullName), ['Amal Monir', 'Mohamed Anan']);
  check('P  a teacher with no booked lesson is not listed', withHourly[2].teachers.some((t) => t.id === 'h-idle'), false);
  check('P  a soft-deleted teacher is not listed', withHourly[2].teachers.some((t) => t.id === 'h-del'), false);
  check('Q  a roster teacher with lessons stays ONLY in their shift group',
    withHourly.filter((g) => g.teachers.some((t) => t.id === '1be38a96-e963-4fce-84a8-7fecd0857195')).map((g) => g.name), ['Full-time']);
  check('Q  the 14 shift members are unchanged', withHourly.slice(0, 2).map(names), roster.map(names));
  check('Q  the shift windows are unchanged',
    withHourly.slice(0, 2).map((g) => [g.startMinute, g.endMinute]), [[720, 1140], [840, 1080]]);
  check('R  the Hourly group has NO working window (nothing invented)', [withHourly[2].startMinute, withHourly[2].endMinute], [null, null]);
  check('R  its window label is null, shift labels are unchanged',
    withHourly.map(rosterGroupWindowLabel), ['12:00 PM–7:00 PM', '2:00 PM–6:00 PM', null]);
  check('S  no scheduled teachers => exactly the old two groups', buildScheduleRoster([FULL_TPL, PART_TPL], ASSIGNMENTS, all), roster);
  check('S  hourly-only (no shift config at all) still yields the Hourly group',
    buildScheduleRoster([], [], all, scheduled).map((g) => g.templateId), [HOURLY_GROUP_ID]);
  check('S  diagnostics are unaffected by the Hourly group',
    buildScheduleRosterWithDiagnostics([FULL_TPL, PART_TPL], ASSIGNMENTS, all, scheduled).unresolved, []);

  // T. The hourly row through the real filter pipeline: drawn, inert.
  const L = (id, teacherId, start, dur) => ({ id, teacherId, dayOfWeek: 6, startMinute: start, durationMinutes: dur, endMinute: start + dur,
    lifecycleStatus: 'active', courseId: null, participants: [{ id: `p-${id}`, lessonId: id, studentId: `s-${id}`, createdAt: '' }] });
  const lessons = [L('early', 'h-anan', 345, 30), L('odd', 'h-anan', 14 * 60 + 10, 50), L('eve', 'h-amal', 22 * 60, 60)];
  const groupOf = new Map(withHourly.flatMap((g) => g.teachers.map((t) => [t.id, [g.templateId]])));
  const base = { teacherIds: [], courseIds: [], studentIds: [], coursePendingOnly: false, teacherType: null, shiftTemplateIds: [],
    supervisorIds: [], lifecycleStatuses: [], availableOnly: false, outsideShiftOnly: false, primeTimeOnly: false,
    groupFilter: null, timeRangeStart: null, timeRangeEnd: null };
  const run = (filters) => deriveScheduleRows({
    rosterTeachers: withHourly.flatMap((g) => g.teachers), lessons, availability: [],
    supervisorIdByStudentId: new Map(), studentNameById: new Map(), templateIdsByTeacherId: groupOf, filters: { ...base, ...filters }, searchQuery: '',
  });
  const anan = run({}).find((r) => r.teacher.id === 'h-anan');
  check('T  an hourly teacher with no availability gets a row', anan !== undefined, true);
  check('T  every lesson is drawn at its exact source minute (05:45, 14:10/50m)',
    anan.lessons.map((l) => [l.startMinute, l.durationMinutes]), [[345, 30], [850, 50]]);
  check('T  the hourly row has no availability (no invented window)', anan.availability, []);
  check('T  "outside shift" never flags an hourly lesson (no shift to be outside of)',
    run({ outsideShiftOnly: true }).some((r) => r.teacher.id.startsWith('h-')), false);
  check('T  "free time" never lists an hourly teacher (unknown hours are not free)',
    run({ availableOnly: true }).some((r) => r.teacher.id.startsWith('h-')), false);
  check('T  the Hourly legend chip filters to exactly the hourly rows',
    run({ shiftTemplateIds: [HOURLY_GROUP_ID] }).map((r) => r.teacher.id), ['h-amal', 'h-anan']);
  check('T  the teacher-type filter "hourly" selects the hourly rows',
    run({ teacherType: 'hourly' }).map((r) => r.teacher.id), ['h-amal', 'h-anan']);
}

console.log('\n' + results.join('\n'));
console.log('\n' + '='.repeat(78));
console.log(`TOTAL: ${pass} passed, ${fail} failed`);
console.log('='.repeat(78));
process.exit(fail === 0 ? 0 : 1);

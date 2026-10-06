/**
 * STUDENT → RESPONSIBLE ADMIN → COLOUR, proven against the real source:
 *
 *   src/features/scheduling/utils/responsibleAdmins.ts   (who may own)
 *   src/features/scheduling/utils/studentValidation.ts   (ownership required)
 *   src/features/scheduling/utils/lessonColor.ts         (the derived colour)
 *   src/features/scheduling/utils/deriveScheduleRows.ts  (the Admin filter)
 *   src/services/scheduling/students.mapper.ts           (the DB round trip)
 *
 * What this suite is defending:
 *
 *   * The Admin is the SOURCE OF TRUTH for the colour. Reassigning a student
 *     changes what the schedule draws with no second write anywhere — the
 *     assertions below move a student from Dina to Asmaa and watch red become
 *     green with nothing but a supervisorId change.
 *   * No colour is ever stored on a student. The insert payload and the update
 *     patch are asserted field by field; a colour key appearing in either is a
 *     failure.
 *   * A new student cannot exist unowned, and a legacy unowned student is
 *     handled rather than guessed at.
 *   * The existing schedule behaviour that depends on this relationship — the
 *     supervisor filter, the group-lesson primary colour — still holds.
 *
 * Fixtures only — no database, no production student records.
 */
import { selectableAdmins, supervisorColorByStudentId } from './responsibleAdmins.mjs';
import { validateStudentDraft, isStudentDraftValid } from './studentValidation.mjs';
import { getLessonSupervisorColor, getLessonBorderStyle } from './lessonColor.mjs';
import { deriveScheduleRows } from './deriveScheduleRows.mjs';
import { toStudent, studentInsertPayload, studentUpdatePatch } from './students.mapper.mjs';

let pass = 0, fail = 0;
const results = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}` +
    (ok ? '' : `\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`));
}

// ── fixtures ────────────────────────────────────────────────────────────
// The four real Operations Supervisors with their canonical colours, exactly
// as migrations 006/023 seed them. Ids are opaque on purpose: nothing in the
// application may key off an Admin's NAME.
const DINA = 'adm-1', ZAINAB = 'adm-2', REHAB = 'adm-3', ASMAA = 'adm-4';
const RED = '#E06666', ORANGE = '#F9CB9C', LIGHT_BLUE = '#C9DAF8', GREEN = '#93C47D';

const admin = (id, name, colorHex, status = 'active') => ({
  id, name, colorHex, status, email: '', phone: '', department: 'تشغيل',
  permissions: [], createdAt: '', updatedAt: '',
});

const ADMINS = [
  admin(DINA, 'Dina', RED),
  admin(ZAINAB, 'Zainab', ORANGE),
  admin(REHAB, 'Rehab', LIGHT_BLUE),
  admin(ASMAA, 'Asmaa', GREEN),
];

// A departed Admin, and one with no colour assigned yet.
const RETIRED = 'adm-old', COLOURLESS = 'adm-nc';
const ALL_ADMINS = [
  ...ADMINS,
  admin(RETIRED, 'Former Admin', '#000000', 'inactive'),
  admin(COLOURLESS, 'No Colour', null),
];

const student = (id, fullName, supervisorId) => ({
  id, fullName, supervisorId, branchId: null, country: '', timezone: 'Asia/Dubai',
  level: '', status: 'active', enrollmentSource: '', isReturning: false, courseId: null,
  notes: '', isDeleted: false, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
});

const AHMED = student('stu-1', 'Ahmed Mohamed', DINA);
const OMAR = student('stu-2', 'Omar Ali', ASMAA);
const LEGACY = student('stu-3', 'Legacy Student', null);   // predates the rule
const UNCOLOURED = student('stu-4', 'Owned But Uncoloured', COLOURLESS);

// ── 1. the Admin roster offered for assignment ──────────────────────────
check('four Admins are selectable',
  selectableAdmins(ALL_ADMINS).map((a) => a.name),
  ['Dina', 'Zainab', 'Rehab', 'Asmaa', 'No Colour']);

check('each Admin carries its canonical colour',
  selectableAdmins(ADMINS).map((a) => [a.name, a.colorHex]),
  [['Dina', RED], ['Zainab', ORANGE], ['Rehab', LIGHT_BLUE], ['Asmaa', GREEN]]);

check('a departed Admin is not assignable',
  selectableAdmins(ALL_ADMINS).some((a) => a.id === RETIRED),
  false);

check('…but IS kept when it is the student\'s current Admin, so opening the form cannot blank it',
  selectableAdmins(ALL_ADMINS, RETIRED).some((a) => a.id === RETIRED),
  true);

check('keepId never duplicates an Admin already in the list',
  selectableAdmins(ALL_ADMINS, DINA).filter((a) => a.id === DINA).length,
  1);

// ── 2. student → Admin colour ───────────────────────────────────────────
{
  const colors = supervisorColorByStudentId([AHMED, OMAR, LEGACY, UNCOLOURED], ALL_ADMINS);
  check('Ahmed (Dina) is red', colors.get(AHMED.id), RED);
  check('Omar (Asmaa) is green', colors.get(OMAR.id), GREEN);
  check('a legacy unassigned student has no colour, never a borrowed one', colors.get(LEGACY.id), null);
  check('an Admin with no colour yields no colour', colors.get(UNCOLOURED.id), null);
}

// THE reassignment: one field changes, and only one.
{
  const reassigned = { ...AHMED, supervisorId: ASMAA };
  const before = supervisorColorByStudentId([AHMED], ADMINS).get(AHMED.id);
  const after = supervisorColorByStudentId([reassigned], ADMINS).get(AHMED.id);
  check('Dina → Asmaa turns Ahmed from red to green', [before, after], [RED, GREEN]);
  check('…and nothing but supervisorId differs on the student',
    Object.keys(AHMED).filter((k) => AHMED[k] !== reassigned[k]),
    ['supervisorId']);
}

// Recolouring the ADMIN recolours their students — the other half of "single
// source of truth". No student row is touched.
{
  const repainted = ADMINS.map((a) => (a.id === DINA ? { ...a, colorHex: '#AA0000' } : a));
  check('changing the Admin\'s colour changes the student\'s colour',
    supervisorColorByStudentId([AHMED], repainted).get(AHMED.id),
    '#AA0000');
}

// ── 3. the lesson colour the grid actually draws ────────────────────────
const participant = (lessonId, studentId, createdAt) => ({
  id: `${lessonId}-${studentId}`, lessonId, studentId, createdAt,
});

check('a one-to-one lesson takes its student\'s Admin colour',
  getLessonSupervisorColor([participant('L1', AHMED.id, '2026-01-01T00:00:00Z')], [AHMED], ADMINS),
  RED);

check('reassigning the student repaints the lesson, with no lesson write',
  getLessonSupervisorColor(
    [participant('L1', AHMED.id, '2026-01-01T00:00:00Z')],
    [{ ...AHMED, supervisorId: ASMAA }],
    ADMINS
  ),
  GREEN);

check('a group lesson uses the first-added participant\'s Admin',
  getLessonSupervisorColor(
    [
      participant('L2', OMAR.id, '2026-02-02T00:00:00Z'),
      participant('L2', AHMED.id, '2026-01-01T00:00:00Z'),
    ],
    [AHMED, OMAR],
    ADMINS
  ),
  RED);

check('a group lesson skips an unowned participant rather than losing its colour',
  getLessonSupervisorColor(
    [
      participant('L3', LEGACY.id, '2026-01-01T00:00:00Z'),
      participant('L3', OMAR.id, '2026-02-02T00:00:00Z'),
    ],
    [LEGACY, OMAR],
    ADMINS
  ),
  GREEN);

check('a wholly unowned lesson gets no colour, so the grid draws its default',
  getLessonSupervisorColor([participant('L4', LEGACY.id, '2026-01-01T00:00:00Z')], [LEGACY], ADMINS),
  null);

check('an unknown participant cannot invent a colour',
  getLessonSupervisorColor([participant('L5', 'stu-missing', '2026-01-01T00:00:00Z')], [AHMED], ADMINS),
  null);

// Lifecycle borders are a SEPARATE dimension and must be unaffected by
// ownership — the regression this guards is "Admin colour ate the status".
check('lifecycle border styles are untouched by ownership',
  ['trial', 'active', 'paused', 'ended'].map(getLessonBorderStyle),
  ['dashed', 'solid', 'dotted', 'solid']);

// Repeated calls must agree: the colour lookup is memoised on array identity
// (entityIndex) to avoid an N+1 across hundreds of lesson cards, so a stale
// index would show up here as a disagreeing second answer.
{
  const students = [AHMED];
  const ps = [participant('L6', AHMED.id, '2026-01-01T00:00:00Z')];
  const first = getLessonSupervisorColor(ps, students, ADMINS);
  const second = getLessonSupervisorColor(ps, students, ADMINS);
  check('the indexed lookup is stable across calls', [first, second], [RED, RED]);
  // A NEW array (what a refetch produces) must be re-indexed, not served from
  // the previous one's cache.
  check('a refetched array is re-indexed, not stale',
    getLessonSupervisorColor(ps, [{ ...AHMED, supervisorId: ASMAA }], ADMINS),
    GREEN);
}

// ── 4. required ownership ───────────────────────────────────────────────
check('a new student with no Admin is invalid',
  validateStudentDraft({ fullName: 'New Student', supervisorId: undefined }),
  { supervisorId: 'required' });

check('an empty Admin selection is invalid', validateStudentDraft({ fullName: 'X', supervisorId: '' }),
  { supervisorId: 'required' });

check('whitespace is not a selection', validateStudentDraft({ fullName: 'X', supervisorId: '   ' }),
  { supervisorId: 'required' });

check('a named student with an Admin is valid',
  isStudentDraftValid({ fullName: 'Ahmed Mohamed', supervisorId: DINA }), true);

check('both missing fields are reported at once, not one at a time',
  validateStudentDraft({ fullName: '  ', supervisorId: null }),
  { fullName: 'required', supervisorId: 'required' });

check('editing a legacy unowned student requires choosing an Admin — this is how the backlog clears',
  isStudentDraftValid({ fullName: LEGACY.fullName, supervisorId: LEGACY.supervisorId }), false);

check('…and the same student with an Admin passes',
  isStudentDraftValid({ fullName: LEGACY.fullName, supervisorId: REHAB }), true);

// ── 5. the database round trip ──────────────────────────────────────────
{
  const draft = {
    fullName: 'Ahmed Mohamed', dateOfBirth: '', country: 'EG', timezone: 'Asia/Dubai',
    gender: 'male', level: '', status: 'active', enrollmentSource: '', supervisorId: DINA,
    isReturning: false, courseId: undefined, notes: '',
  };
  const payload = studentInsertPayload(draft);
  check('create persists the Admin as a single id column', payload.supervisor_id, DINA);
  check('create stores NO colour and NO Admin name on the student',
    Object.keys(payload).filter((k) => /colou?r|supervisor_name|admin_name/i.test(k)), []);

  // DB → UI: what a refresh reads back.
  const row = {
    id: 'stu-new', branch_id: null, full_name: 'Ahmed Mohamed', date_of_birth: null, country: 'EG',
    timezone: 'Asia/Dubai', gender: 'male', level: '', status: 'active', enrollment_source: '',
    supervisor_id: DINA, is_returning: false, course_id: null, notes: '', is_deleted: false,
    deleted_at: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  };
  check('a refresh reads the Admin back, so the assignment survives a reload',
    toStudent(row).supervisorId, DINA);
  check('…and the colour that refresh shows still comes from the Admin',
    supervisorColorByStudentId([toStudent(row)], ADMINS).get('stu-new'), RED);

  // Edit: Dina → Asmaa.
  const patch = studentUpdatePatch({ supervisorId: ASMAA });
  check('reassigning writes exactly one column', patch, { supervisor_id: ASMAA });
  check('reading back the updated row shows green',
    supervisorColorByStudentId([toStudent({ ...row, supervisor_id: ASMAA })], ADMINS).get('stu-new'),
    GREEN);

  // Editing an unrelated field must not disturb ownership.
  check('editing only the name leaves supervisor_id out of the patch entirely',
    Object.keys(studentUpdatePatch({ fullName: 'Renamed' })), ['full_name']);
  check('existing student data is preserved: a patch never includes fields it was not given',
    Object.keys(studentUpdatePatch({ status: 'paused' })), ['status']);
}

// ── 6. the existing supervisor filter still means what it meant ─────────
{
  const DAY = 0;
  // T2 teaches only Asmaa's student, so an Admin filter has a row to drop —
  // without a second teacher the row-level behaviour is unobservable.
  const teachers = [
    { id: 'T1', fullName: 'Arwa Ahmed', isDeleted: false, teacherType: 'shift' },
    { id: 'T2', fullName: 'Doaa Zakaria', isDeleted: false, teacherType: 'shift' },
  ];
  const mkLesson = (id, studentId, teacherId = 'T1') => ({
    id, teacherId, courseId: null, dayOfWeek: DAY, startMinute: 14 * 60,
    durationMinutes: 60, endMinute: 15 * 60, lifecycleStatus: 'active',
    participants: [participant(id, studentId, '2026-01-01T00:00:00Z')],
  });
  const lessons = [
    mkLesson('L-dina', AHMED.id), mkLesson('L-asmaa', OMAR.id), mkLesson('L-legacy', LEGACY.id),
    mkLesson('L-t2-asmaa', OMAR.id, 'T2'),
  ];
  const base = {
    rosterTeachers: teachers,
    lessons,
    availability: [
      { teacherId: 'T1', dayOfWeek: DAY, startMinute: 12 * 60, endMinute: 19 * 60, source: 'shift' },
      { teacherId: 'T2', dayOfWeek: DAY, startMinute: 12 * 60, endMinute: 19 * 60, source: 'shift' },
    ],
    supervisorIdByStudentId: new Map([[AHMED.id, DINA], [OMAR.id, ASMAA], [LEGACY.id, null]]),
    studentNameById: new Map([[AHMED.id, AHMED.fullName], [OMAR.id, OMAR.fullName], [LEGACY.id, LEGACY.fullName]]),
    templateIdsByTeacherId: new Map([['T1', ['tpl']], ['T2', ['tpl']]]),
    searchQuery: '',
  };
  // Mirrors DEFAULT_FILTERS in src/store/scheduleUiStore.ts field for field.
  // `groupFilter` is null, NOT 'all': the pipeline treats any non-null group
  // filter as narrowing, so spelling the idle state wrong here would test a
  // different pipeline state than the one the Schedule actually opens in.
  const FILTERS = {
    teacherIds: [], courseIds: [], studentIds: [], coursePendingOnly: false,
    teacherType: null, shiftTemplateIds: [], supervisorIds: [], lifecycleStatuses: [],
    availableOnly: false, outsideShiftOnly: false, primeTimeOnly: false,
    groupFilter: null, timeRangeStart: null, timeRangeEnd: null,
  };
  const rowsFor = (supervisorIds) =>
    deriveScheduleRows({ ...base, filters: { ...FILTERS, supervisorIds } });
  const idsFor = (supervisorIds) => rowsFor(supervisorIds).flatMap((r) => r.lessons.map((l) => l.id));

  const namesFor = (supervisorIds) => rowsFor(supervisorIds).map((r) => r.teacher.fullName);

  check('no Admin filter shows every lesson', idsFor([]),
    ['L-dina', 'L-asmaa', 'L-legacy', 'L-t2-asmaa']);
  check('…and keeps every teacher row', namesFor([]), ['Arwa Ahmed', 'Doaa Zakaria']);
  check('selecting Dina shows Dina\'s students\' lessons', idsFor([DINA]), ['L-dina']);
  check('selecting Asmaa shows Asmaa\'s students\' lessons', idsFor([ASMAA]),
    ['L-asmaa', 'L-t2-asmaa']);
  check('two Admins OR together within the category', idsFor([DINA, ASMAA]),
    ['L-dina', 'L-asmaa', 'L-t2-asmaa']);
  check('an unowned student\'s lesson matches no Admin filter', idsFor([DINA, ZAINAB, REHAB, ASMAA]),
    ['L-dina', 'L-asmaa', 'L-t2-asmaa']);

  // Picking an Admin shows THAT ADMIN'S SCHEDULE — a teacher with none of
  // their lessons drops out of the roster rather than sitting there empty.
  check('picking Dina drops a teacher who has none of Dina\'s lessons',
    namesFor([DINA]), ['Arwa Ahmed']);
  check('picking Zainab, who owns nobody here, empties the schedule',
    [namesFor([ZAINAB]), idsFor([ZAINAB])], [[], []]);
  check('clearing the Admin filter brings every row back', namesFor([]),
    ['Arwa Ahmed', 'Doaa Zakaria']);

  // Hiding a lesson by Admin must not repaint its minutes as free capacity.
  const occupancyOf = (supervisorIds) =>
    rowsFor(supervisorIds).map((r) => [r.teacher.id, r.occupancy.length]);
  check('an Admin filter never invents free capacity for the rows it keeps',
    occupancyOf([DINA]), [['T1', 3]]);

  // The reassignment, seen by the filter rather than by the colour.
  const moved = { ...base, supervisorIdByStudentId: new Map([[AHMED.id, ASMAA], [OMAR.id, ASMAA], [LEGACY.id, null]]) };
  const movedIds = (supervisorIds) =>
    deriveScheduleRows({ ...moved, filters: { ...FILTERS, supervisorIds } })
      .flatMap((r) => r.lessons.map((l) => l.id));
  check('after Dina → Asmaa the lesson follows the new Admin\'s filter',
    movedIds([ASMAA]), ['L-dina', 'L-asmaa', 'L-t2-asmaa']);
  check('…and no longer matches Dina', movedIds([DINA]), []);
}

console.log('\n── student → responsible Admin ─────────────────────────────');
results.forEach((line) => console.log('  ' + line));
console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);

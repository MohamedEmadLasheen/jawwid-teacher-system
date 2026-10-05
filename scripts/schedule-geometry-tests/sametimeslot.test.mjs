/**
 * "Same time slot" membership and bulk-edit preflight.
 *
 * THE DEFINITION: one weekday + one start minute, across ALL teachers.
 * Neither the teacher nor the student takes part in membership.
 *
 * These decide how many lessons a bulk edit or a bulk removal touches, so the
 * cost of getting them wrong is changing or ending records the admin did not
 * choose. Most of what follows asserts what is NOT in the set, and what is
 * NOT allowed to be written.
 *
 * Fixtures only — no database, no production lesson records.
 */
import { findLessonsInSlot, findSlotTargets, isLiveLesson, LIVE_LIFECYCLES } from './sameTimeSlot.mjs';
import { findBatchCollisions } from './bulkEditPreflight.mjs';

let pass = 0, fail = 0;
const results = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}` +
    (ok ? '' : `\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`));
}

const lesson = (id, dayOfWeek, startMinute, over = {}) => ({
  id,
  teacherId: over.teacherId ?? `T-${id}`,
  dayOfWeek,
  startMinute,
  durationMinutes: over.durationMinutes ?? 30,
  lifecycleStatus: over.lifecycleStatus ?? 'active',
  participants: (over.students ?? [`S-${id}`]).map((s, i) => ({ id: `${id}-p${i}`, studentId: s })),
});
const ids = (list) => list.map((l) => l.id);

const SUN = 0, MON = 1, TUE = 2;
const TEN = 10 * 60;

// The reviewer's seed, exactly.
const A = lesson('A', SUN, TEN, { teacherId: 'TA', students: ['SA'] });
const B = lesson('B', SUN, TEN, { teacherId: 'TB', students: ['SB'] });
const C = lesson('C', SUN, TEN, { teacherId: 'TC', students: ['SC'] });
const D = lesson('D', SUN, TEN + 30, { teacherId: 'TD', students: ['SD'] });
const E = lesson('E', MON, TEN, { teacherId: 'TE', students: ['SE'] });
const WORLD = [A, B, C, D, E];

console.log('='.repeat(78));
console.log('A SLOT IS ONE WEEKDAY + ONE START MINUTE, ACROSS ALL TEACHERS');
console.log('='.repeat(78));

check('Sunday 10:00 is exactly A, B, C',
  ids(findLessonsInSlot({ dayOfWeek: SUN, startMinute: TEN }, WORLD)), ['A', 'B', 'C']);
check('   D (Sunday 10:30) is NOT in it',
  ids(findLessonsInSlot({ dayOfWeek: SUN, startMinute: TEN }, WORLD)).includes('D'), false);
check('   E (Monday 10:00) is NOT in it',
  ids(findLessonsInSlot({ dayOfWeek: SUN, startMinute: TEN }, WORLD)).includes('E'), false);
check('different teachers do not prevent membership',
  findLessonsInSlot({ dayOfWeek: SUN, startMinute: TEN }, WORLD).map((l) => l.teacherId),
  ['TA', 'TB', 'TC']);
check('Sunday 10:30 is its own slot',
  ids(findLessonsInSlot({ dayOfWeek: SUN, startMinute: TEN + 30 }, WORLD)), ['D']);
check('Monday 10:00 is its own slot',
  ids(findLessonsInSlot({ dayOfWeek: MON, startMinute: TEN }, WORLD)), ['E']);
check('an empty slot is empty',
  ids(findLessonsInSlot({ dayOfWeek: TUE, startMinute: TEN }, WORLD)), []);

console.log();
console.log('='.repeat(78));
console.log('A SHARED STUDENT DOES NOT GROUP LESSONS');
console.log('='.repeat(78));

{
  // Student SA appears on three different days and at two different times.
  const sunA   = lesson('sunA', SUN, TEN, { teacherId: 'TA', students: ['SA'] });
  const tueA   = lesson('tueA', TUE, TEN, { teacherId: 'TA', students: ['SA'] });
  const sunLate = lesson('sunLateA', SUN, 14 * 60, { teacherId: 'TA', students: ['SA'] });
  const sunB   = lesson('sunB', SUN, TEN, { teacherId: 'TB', students: ['SB'] });
  const world = [sunA, tueA, sunLate, sunB];

  const slot = ids(findLessonsInSlot({ dayOfWeek: SUN, startMinute: TEN }, world));
  check('the same student on another DAY is not in the slot', slot.includes('tueA'), false);
  check('the same student at another TIME is not in the slot', slot.includes('sunLateA'), false);
  check('a different student at the same day+time IS in the slot', slot.includes('sunB'), true);
  check('   so the slot is exactly the two same-minute lessons', slot, ['sunA', 'sunB']);
}

console.log();
console.log('='.repeat(78));
console.log('ONLY LIVE LESSONS — HISTORY IS NEVER TOUCHED');
console.log('='.repeat(78));

{
  const ended  = lesson('ended', SUN, TEN, { lifecycleStatus: 'ended' });
  const paused = lesson('paused', SUN, TEN, { lifecycleStatus: 'paused' });
  const trial  = lesson('trial', SUN, TEN, { lifecycleStatus: 'trial' });
  const world = [A, ended, paused, trial];
  const slot = ids(findLessonsInSlot({ dayOfWeek: SUN, startMinute: TEN }, world));

  check('ended is excluded', slot.includes('ended'), false);
  check('paused is excluded', slot.includes('paused'), false);
  check('trial is included', slot.includes('trial'), true);
  check('   live lifecycles match the EXCLUDE constraint', [...LIVE_LIFECYCLES], ['trial', 'active']);
  check('   isLiveLesson agrees',
    ['active', 'trial', 'ended', 'paused'].map((s) => isLiveLesson({ lifecycleStatus: s })),
    [true, true, false, false]);
}

console.log();
console.log('='.repeat(78));
console.log('THE TARGET LIST ALWAYS CONTAINS THE EDITED LESSON, FIRST');
console.log('='.repeat(78));

check('targets are the subject then the rest of the slot', ids(findSlotTargets(A, WORLD)), ['A', 'B', 'C']);
check('   the subject is first', findSlotTargets(A, WORLD)[0].id, 'A');
check('   never duplicated', ids(findSlotTargets(A, WORLD)).filter((i) => i === 'A').length, 1);
{
  // A lesson rescheduled for this one date is drawn at its override time, so
  // the clicked subject may not match its own stored row. It must still be in
  // its own target list.
  const moved = { ...A, startMinute: 11 * 60 };
  check('a subject that matches no stored row still appears', ids(findSlotTargets(moved, WORLD)), ['A']);
}

console.log();
console.log('='.repeat(78));
console.log('PREFLIGHT: DOES THE BATCH COLLIDE WITH ITSELF?');
console.log('='.repeat(78));

{
  const slot = [A, B, C];

  check('no change proposed -> no collisions', findBatchCollisions(slot, {}).length, 0);
  check('moving the slot to a new time keeps teachers apart',
    findBatchCollisions(slot, { startMinute: 11 * 60 }).length, 0);
  check('moving the slot to a new day keeps teachers apart',
    findBatchCollisions(slot, { dayOfWeek: TUE }).length, 0);
  check('lengthening every lesson in the slot is fine',
    findBatchCollisions(slot, { durationMinutes: 60 }).length, 0);

  // The case that cannot be caught by a per-lesson database check.
  const teacherClash = findBatchCollisions(slot, { teacherId: 'TZ' });
  check('putting the whole slot on ONE teacher collides', teacherClash.length > 0, true);
  check('   and names the teacher', teacherClash[0].kind, 'teacher');
  check('   with the two lessons that clash', teacherClash[0].subjectId, 'TZ');

  // One lesson alone can always take the new teacher.
  check('a single-lesson batch never self-collides',
    findBatchCollisions([A], { teacherId: 'TZ' }).length, 0);
}

{
  // A student in two lessons of the same slot would collide the moment the
  // slot moves as a unit — the student EXCLUDE constraint, mirrored.
  const x1 = lesson('x1', SUN, TEN, { teacherId: 'T1', students: ['SHARED'] });
  const x2 = lesson('x2', SUN, TEN, { teacherId: 'T2', students: ['SHARED'] });
  const found = findBatchCollisions([x1, x2], { startMinute: 11 * 60 });
  check('two lessons sharing a student collide', found.length, 1);
  check('   reported as a student collision', found[0].kind, 'student');
  check('   naming the student', found[0].subjectId, 'SHARED');
}

{
  // Durations matter: 10:00+60 overlaps 10:30, so lengthening lessons that
  // sit next to each other on one teacher collides.
  const a = lesson('a', SUN, TEN, { teacherId: 'TSAME' });
  const b = lesson('b', SUN, TEN + 30, { teacherId: 'TSAME' });
  check('adjacent lessons on one teacher do not collide at 30 minutes',
    findBatchCollisions([a, b], {}).length, 0);
  check('   but do once both are 60 minutes',
    findBatchCollisions([a, b], { durationMinutes: 60 }).length, 1);
  check('   touching end-to-start is not an overlap',
    findBatchCollisions([a, b], { durationMinutes: 30 }).length, 0);
}

console.log();
console.log(results.join('\n'));
console.log('-'.repeat(78));
console.log(`TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

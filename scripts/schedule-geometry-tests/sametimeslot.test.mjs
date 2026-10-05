/**
 * "Same time slot" membership (findSameTimeSlotLessons).
 *
 * This rule decides how many lessons a bulk edit or a bulk removal touches,
 * so the cost of getting it wrong is changing or ending records the admin did
 * not mean to. Most of what follows asserts what is NOT in the set.
 *
 * The rule: same start minute AND at least one shared student, across days,
 * live lifecycles only.
 *
 * Fixtures only — no database, no production lesson records.
 */
import { findSameTimeSlotLessons, isLiveLesson, LIVE_LIFECYCLES } from './sameTimeSlot.mjs';

let pass = 0, fail = 0;
const results = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}` +
    (ok ? '' : `\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`));
}

let seq = 0;
const lesson = (over = {}) => ({
  id: over.id ?? `L${++seq}`,
  teacherId: over.teacherId ?? 'T1',
  dayOfWeek: over.dayOfWeek ?? 0,
  startMinute: over.startMinute ?? 15 * 60,
  durationMinutes: over.durationMinutes ?? 30,
  lifecycleStatus: over.lifecycleStatus ?? 'active',
  participants: (over.students ?? ['S1']).map((s, i) => ({ id: `${over.id ?? 'L'}-p${i}`, studentId: s })),
});
const ids = (list) => list.map((l) => l.id);

console.log('='.repeat(78));
console.log('THE SLOT IS: SAME START MINUTE + SHARED STUDENT, ACROSS DAYS');
console.log('='.repeat(78));

{
  const subject = lesson({ id: 'A', dayOfWeek: 0, startMinute: 900, students: ['S1'] });
  const tue     = lesson({ id: 'B', dayOfWeek: 2, startMinute: 900, students: ['S1'] });
  const thu     = lesson({ id: 'C', dayOfWeek: 4, startMinute: 900, students: ['S1'] });
  const all = [subject, tue, thu];

  check('the student\'s weekly pattern at that time is one slot',
    ids(findSameTimeSlotLessons(subject, all)), ['A', 'B', 'C']);
  check('   the subject is always first', findSameTimeSlotLessons(subject, all)[0].id, 'A');
  check('   results are ordered by day',
    findSameTimeSlotLessons(subject, all).map((l) => l.dayOfWeek), [0, 2, 4]);
  check('   the subject is not duplicated when it is also in the list',
    findSameTimeSlotLessons(subject, all).filter((l) => l.id === 'A').length, 1);
}

console.log();
console.log('='.repeat(78));
console.log('WHAT IS EXCLUDED — THE PART THAT PREVENTS UNINTENDED BULK CHANGES');
console.log('='.repeat(78));

{
  const subject = lesson({ id: 'A', startMinute: 900, students: ['S1'] });

  check('a different start minute is a different slot',
    ids(findSameTimeSlotLessons(subject, [subject, lesson({ id: 'X', dayOfWeek: 2, startMinute: 930, students: ['S1'] })])),
    ['A']);

  check('another student at the same time is NOT in the slot',
    ids(findSameTimeSlotLessons(subject, [subject, lesson({ id: 'X', dayOfWeek: 2, startMinute: 900, students: ['S9'] })])),
    ['A']);

  check('same teacher but a different student is NOT in the slot',
    ids(findSameTimeSlotLessons(subject, [subject, lesson({ id: 'X', dayOfWeek: 2, startMinute: 900, teacherId: 'T1', students: ['S9'] })])),
    ['A']);

  // The whole vertical column of the grid must never be swept up.
  const column = [
    subject,
    lesson({ id: 'X1', dayOfWeek: 0, startMinute: 900, teacherId: 'T2', students: ['S2'] }),
    lesson({ id: 'X2', dayOfWeek: 0, startMinute: 900, teacherId: 'T3', students: ['S3'] }),
  ];
  check('every teacher at the same day+time is NOT the slot',
    ids(findSameTimeSlotLessons(subject, column)), ['A']);
}

console.log();
console.log('='.repeat(78));
console.log('ONLY LIVE LESSONS — HISTORY IS NEVER TOUCHED');
console.log('='.repeat(78));

{
  const subject = lesson({ id: 'A', startMinute: 900, students: ['S1'] });
  const ended  = lesson({ id: 'E', dayOfWeek: 2, startMinute: 900, students: ['S1'], lifecycleStatus: 'ended' });
  const paused = lesson({ id: 'P', dayOfWeek: 3, startMinute: 900, students: ['S1'], lifecycleStatus: 'paused' });
  const trial  = lesson({ id: 'R', dayOfWeek: 4, startMinute: 900, students: ['S1'], lifecycleStatus: 'trial' });

  check('ended lessons are excluded',
    ids(findSameTimeSlotLessons(subject, [subject, ended])), ['A']);
  check('paused lessons are excluded',
    ids(findSameTimeSlotLessons(subject, [subject, paused])), ['A']);
  check('trial lessons ARE included (they occupy the slot)',
    ids(findSameTimeSlotLessons(subject, [subject, trial])), ['A', 'R']);
  check('   the live set matches the EXCLUDE constraint\'s lifecycles',
    [...LIVE_LIFECYCLES], ['trial', 'active']);
  check('   isLiveLesson agrees',
    [isLiveLesson({ lifecycleStatus: 'active' }), isLiveLesson({ lifecycleStatus: 'trial' }),
     isLiveLesson({ lifecycleStatus: 'ended' }), isLiveLesson({ lifecycleStatus: 'paused' })],
    [true, true, false, false]);
}

console.log();
console.log('='.repeat(78));
console.log('GROUP LESSONS — SHARING ANY STUDENT IS ENOUGH');
console.log('='.repeat(78));

{
  const subject = lesson({ id: 'A', startMinute: 900, students: ['S1', 'S2'] });
  check('a lesson sharing one of several students is in the slot',
    ids(findSameTimeSlotLessons(subject, [subject, lesson({ id: 'G', dayOfWeek: 2, startMinute: 900, students: ['S2', 'S7'] })])),
    ['A', 'G']);
  check('a lesson sharing none of them is not',
    ids(findSameTimeSlotLessons(subject, [subject, lesson({ id: 'G', dayOfWeek: 2, startMinute: 900, students: ['S7', 'S8'] })])),
    ['A']);
}

console.log();
console.log('='.repeat(78));
console.log('DEGENERATE INPUTS CANNOT WIDEN THE SET');
console.log('='.repeat(78));

{
  // A lesson with no participants must match only itself — otherwise the
  // "shares a student" test would be vacuously true against other orphans.
  const orphan = { ...lesson({ id: 'O', startMinute: 900 }), participants: [] };
  const otherOrphan = { ...lesson({ id: 'O2', dayOfWeek: 2, startMinute: 900 }), participants: [] };
  check('a lesson with no participants matches only itself',
    ids(findSameTimeSlotLessons(orphan, [orphan, otherOrphan])), ['O']);

  const subject = lesson({ id: 'A', startMinute: 900, students: ['S1'] });
  check('an empty world still returns the subject',
    ids(findSameTimeSlotLessons(subject, [])), ['A']);
  check('a world without the subject still returns it first',
    ids(findSameTimeSlotLessons(subject, [lesson({ id: 'B', dayOfWeek: 2, startMinute: 900, students: ['S1'] })])),
    ['A', 'B']);
  check('   and never returns fewer than one lesson',
    findSameTimeSlotLessons(subject, []).length >= 1, true);
}

console.log();
console.log(results.join('\n'));
console.log('-'.repeat(78));
console.log(`TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

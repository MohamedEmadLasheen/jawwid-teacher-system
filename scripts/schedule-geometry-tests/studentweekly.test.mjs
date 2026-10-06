/**
 * A student's weekly recurring schedule.
 *
 * STUDENT WEEKLY SCHEDULE = every live recurring lesson in which this student
 * is a participant. Membership comes from lesson_participants and from
 * nothing else — never from the teacher, the day or the time.
 *
 * This is a DIFFERENT concept from "the same time slot", which is day+minute
 * across all teachers and ignores students entirely. The two are asserted
 * against each other below so neither can drift into the other.
 *
 * Fixtures only — no database, no production lesson records.
 */
import {
  findStudentWeeklyLessons, isOccurrenceCancelled, isOccurrenceRescheduled,
  occurrenceOverride,
} from './studentWeeklySchedule.mjs';
import { findLessonsInSlot } from './sameTimeSlot.mjs';

let pass = 0, fail = 0;
const results = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}` +
    (ok ? '' : `\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`));
}

const lesson = (id, dayOfWeek, startMinute, students, over = {}) => ({
  id,
  teacherId: over.teacherId ?? 'TA',
  dayOfWeek,
  startMinute,
  durationMinutes: over.durationMinutes ?? 30,
  lifecycleStatus: over.lifecycleStatus ?? 'active',
  participants: students.map((s, i) => ({ id: `${id}-p${i}`, studentId: s })),
});
const ids = (l) => l.map((x) => x.id);

const SUN = 0, TUE = 2, WED = 3;

// Ahmed's real weekly schedule, plus everything that must not join it.
const sun  = lesson('SUN', SUN, 16 * 60 + 30, ['AHMED']);
const tue  = lesson('TUE', TUE, 16 * 60 + 30, ['AHMED']);
const wed  = lesson('WED', WED, 17 * 60, ['AHMED'], { teacherId: 'TB', durationMinutes: 40 });
const other = lesson('OTHER-STUDENT', SUN, 16 * 60 + 30, ['OMAR'], { teacherId: 'TB' });
const ended = lesson('ENDED', WED, 16 * 60 + 30, ['AHMED'], { lifecycleStatus: 'ended' });
const paused = lesson('PAUSED', TUE, 18 * 60, ['AHMED'], { lifecycleStatus: 'paused' });
const group = lesson('GROUP', WED, 19 * 60, ['AHMED', 'OMAR']);
const WORLD = [sun, tue, wed, other, ended, paused, group];

console.log('='.repeat(78));
console.log('THE WEEKLY SCHEDULE IS THE STUDENT\'S OWN LIVE RECURRING LESSONS');
console.log('='.repeat(78));

check('Ahmed\'s weekly schedule, sorted by day then time',
  ids(findStudentWeeklyLessons('AHMED', WORLD)), ['SUN', 'TUE', 'WED', 'GROUP']);
check('   another student\'s lesson at the same day+time is excluded',
  ids(findStudentWeeklyLessons('AHMED', WORLD)).includes('OTHER-STUDENT'), false);
check('   ended lessons are excluded', ids(findStudentWeeklyLessons('AHMED', WORLD)).includes('ENDED'), false);
check('   paused lessons are excluded', ids(findStudentWeeklyLessons('AHMED', WORLD)).includes('PAUSED'), false);
check('   a group lesson the student is in IS included',
  ids(findStudentWeeklyLessons('AHMED', WORLD)).includes('GROUP'), true);
check('Omar sees only his own', ids(findStudentWeeklyLessons('OMAR', WORLD)), ['OTHER-STUDENT', 'GROUP']);
check('an unknown student has an empty schedule', findStudentWeeklyLessons('NOBODY', WORLD), []);

{
  // Sorting is day, then minute, then id.
  const a = lesson('b-late', WED, 18 * 60, ['S']);
  const b = lesson('a-early', WED, 9 * 60, ['S']);
  const c = lesson('a-sun', SUN, 23 * 60, ['S']);
  check('sorted by weekday first, then start minute',
    ids(findStudentWeeklyLessons('S', [a, b, c])), ['a-sun', 'a-early', 'b-late']);
}

console.log();
console.log('='.repeat(78));
console.log('STUDENT SCHEDULE AND TIME SLOT ARE DIFFERENT QUESTIONS');
console.log('='.repeat(78));

{
  // Sunday 16:30 holds Ahmed's lesson and Omar's, with different teachers.
  const slot = ids(findLessonsInSlot({ dayOfWeek: SUN, startMinute: 16 * 60 + 30 }, WORLD));
  const weekly = ids(findStudentWeeklyLessons('AHMED', WORLD));

  check('the SLOT is both students at that day+time', slot, ['OTHER-STUDENT', 'SUN']);
  check('   it includes a lesson Ahmed is not in', slot.includes('OTHER-STUDENT'), true);
  check('the WEEKLY schedule spans days and excludes that lesson',
    weekly.includes('OTHER-STUDENT'), false);
  check('   and includes days the slot never would',
    [weekly.includes('TUE'), slot.includes('TUE')], [true, false]);
}

console.log();
console.log('='.repeat(78));
console.log('AN OCCURRENCE EXCEPTION IS NEVER THE RECURRING SCHEDULE');
console.log('='.repeat(78));

{
  const stored = lesson('L', SUN, 16 * 60 + 30, ['AHMED']); // Sunday 4:30 PM
  const entry = (exc) => ({ lesson: stored, occurrenceDate: '2026-10-11', occurrenceException: exc });

  const rescheduled = entry({
    status: 'rescheduled', overrideTeacherId: null,
    overrideStartMinute: 17 * 60, overrideDurationMinutes: null,
  });
  check('a rescheduled occurrence is flagged', isOccurrenceRescheduled(rescheduled), true);
  check('   the recurring start minute is untouched', rescheduled.lesson.startMinute, 16 * 60 + 30);
  check('   the override is reported separately', occurrenceOverride(rescheduled).startMinute, 17 * 60);
  check('   and it is not a cancellation', isOccurrenceCancelled(rescheduled), false);

  const cancelled = entry({
    status: 'cancelled', overrideTeacherId: null,
    overrideStartMinute: null, overrideDurationMinutes: null,
  });
  check('a cancelled occurrence is flagged', isOccurrenceCancelled(cancelled), true);
  check('   the recurring lesson still stands', cancelled.lesson.startMinute, 16 * 60 + 30);
  check('   and is not reported as rescheduled', isOccurrenceRescheduled(cancelled), false);

  const none = entry(null);
  check('no exception -> neither flag',
    [isOccurrenceCancelled(none), isOccurrenceRescheduled(none)], [false, false]);
  check('   and the override reads back the stored values',
    occurrenceOverride(none).startMinute, 16 * 60 + 30);

  // A 'rescheduled' row that changes nothing is not worth warning about.
  const noop = entry({
    status: 'rescheduled', overrideTeacherId: stored.teacherId,
    overrideStartMinute: stored.startMinute, overrideDurationMinutes: stored.durationMinutes,
  });
  check('a reschedule identical to the stored values is not flagged',
    isOccurrenceRescheduled(noop), false);
}

console.log();
console.log('='.repeat(78));
console.log('REGRESSION: THE SLOT RESOLVES FROM STORED VALUES, NOT THE OVERRIDE');
console.log('='.repeat(78));

{
  /**
   * Stored lesson      Sunday 4:30 PM
   * This occurrence    rescheduled to Sunday 5:00 PM
   *
   * Choosing the bulk scope for that lesson must resolve Sunday + 4:30,
   * because a temporary occurrence-level deviation must never redefine slot
   * membership. The grid hands the UI a 5:00 PM copy; the stored record is
   * what the scope must be asked about.
   */
  const STORED_START = 16 * 60 + 30;   // 4:30 PM
  const OVERRIDE_START = 17 * 60;      // 5:00 PM

  const storedRecord   = lesson('ANCHOR', SUN, STORED_START, ['AHMED']);
  const alsoAt430      = lesson('PEER-430', SUN, STORED_START, ['OMAR'], { teacherId: 'TB' });
  const alreadyAt500   = lesson('PEER-500', SUN, OVERRIDE_START, ['ZARA'], { teacherId: 'TC' });
  const world = [storedRecord, alsoAt430, alreadyAt500];

  // What the grid would hand the dialog for that lesson.
  const overlaidCopy = { ...storedRecord, startMinute: OVERRIDE_START };

  const fromStored  = ids(findLessonsInSlot(
    { dayOfWeek: storedRecord.dayOfWeek, startMinute: storedRecord.startMinute }, world));
  const fromOverlay = ids(findLessonsInSlot(
    { dayOfWeek: overlaidCopy.dayOfWeek, startMinute: overlaidCopy.startMinute }, world));

  check('resolving from the STORED record gives the 4:30 slot', fromStored, ['ANCHOR', 'PEER-430']);
  check('   it does NOT pull in the 5:00 lesson', fromStored.includes('PEER-500'), false);
  check('resolving from the OVERLAID copy would give the wrong slot', fromOverlay, ['PEER-500']);
  check('   which is exactly the mistake this guards against',
    fromStored.join() === fromOverlay.join(), false);
}

console.log();
console.log(results.join('\n'));
console.log('-'.repeat(78));
console.log(`TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

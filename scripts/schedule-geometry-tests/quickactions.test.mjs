/**
 * Candidate start times for the mobile "Change time" picker
 * (buildLessonTimeOptions).
 *
 * What these assert is that the list is DERIVED, not enumerated: every
 * candidate comes from the configured timeline, every rejection is judged
 * against the lesson's real duration, and the teacher's working window comes
 * from availability data. No hour, teacher or shift is written down here —
 * the expected values are computed from the same constants the product reads.
 *
 * Fixtures only — no database, no production lesson records.
 */
import { buildLessonTimeOptions } from './lessonTimeOptions.mjs';
import { GRID_START_MINUTE, GRID_END_MINUTE, GRID_COLUMNS, SLOT_MINUTES } from './schedulingConstants.mjs';

let pass = 0, fail = 0;
const results = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}` +
    (ok ? '' : `\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`));
}

const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const win = (s, e) => [{ startMinute: s, endMinute: e }];

/** Every option keyed by its start minute, for direct lookup. */
const byStart = (opts) => Object.fromEntries(opts.map((o) => [o.startMinute, o]));

const build = (over = {}) =>
  buildLessonTimeOptions({
    currentStartMinute: 15 * 60,
    durationMinutes: 30,
    availability: win(12 * 60, 19 * 60),
    otherLessons: [],
    ...over,
  });

console.log('='.repeat(78));
console.log('QUICK ACTIONS · CANDIDATE TIMES ARE DERIVED FROM THE TIMELINE');
console.log('='.repeat(78));

{
  const opts = build();
  check('one candidate per configured grid column', opts.length, GRID_COLUMNS.length);
  check('candidates are exactly the grid columns', opts.map((o) => o.startMinute), GRID_COLUMNS);
  check('first candidate is the timeline start', opts[0].startMinute, GRID_START_MINUTE);
  check('candidates step by SLOT_MINUTES',
    opts[1].startMinute - opts[0].startMinute, SLOT_MINUTES);
  check('end minute is start + the lesson duration',
    opts[0].endMinute - opts[0].startMinute, 30);
}

console.log();
console.log('='.repeat(78));
console.log('THE CURRENT TIME IS SELECTED AND NEVER BLOCKS ITSELF');
console.log('='.repeat(78));

{
  const current = 15 * 60;
  // The lesson's own slot is passed in otherLessons by mistake? No — the
  // caller excludes it. But even a narrowed window must not lock the admin
  // out of the row their lesson currently occupies.
  const opts = byStart(build({ currentStartMinute: current, availability: win(16 * 60, 18 * 60) }));
  check(`${hhmm(current)} is flagged as the current time`, opts[current].isCurrent, true);
  check('   current time stays selectable even outside the window', opts[current].isSelectable, true);
  check('   current time reports no block reason', opts[current].blockReason, null);
  check('   exactly one candidate is the current one',
    Object.values(opts).filter((o) => o.isCurrent).length, 1);
}

console.log();
console.log('='.repeat(78));
console.log('DURATION IS RESPECTED — NOT JUST THE START SLOT');
console.log('='.repeat(78));

{
  // A 60-minute lesson cannot start in the last slot: it would run past the
  // end of the timeline. Computed from the constants, not hardcoded.
  const lastSlot = GRID_END_MINUTE - SLOT_MINUTES;
  const sixty = byStart(build({ durationMinutes: 60, availability: [] }));
  check(`60-min lesson is rejected at the last slot (${hhmm(lastSlot)})`,
    sixty[lastSlot].blockReason, 'outside_timeline');
  check('   and is not selectable there', sixty[lastSlot].isSelectable, false);
  check(`   but fits at ${hhmm(lastSlot - SLOT_MINUTES)}`,
    sixty[lastSlot - SLOT_MINUTES].blockReason, null);

  const thirty = byStart(build({ durationMinutes: 30, availability: [] }));
  check(`30-min lesson DOES fit at the last slot (${hhmm(lastSlot)})`,
    thirty[lastSlot].blockReason, null);

  // 90 minutes pushes the last viable start two slots earlier again.
  const ninety = byStart(build({ durationMinutes: 90, availability: [] }));
  check('90-min lesson rejected two slots from the end',
    ninety[lastSlot - SLOT_MINUTES].blockReason, 'outside_timeline');
  check('   and allowed three slots from the end',
    ninety[lastSlot - 2 * SLOT_MINUTES].blockReason, null);
}

console.log();
console.log('='.repeat(78));
console.log('THE WORKING WINDOW COMES FROM AVAILABILITY DATA');
console.log('='.repeat(78));

{
  const start = 14 * 60, end = 18 * 60;
  const opts = byStart(build({ durationMinutes: 30, availability: win(start, end) }));

  check(`${hhmm(start - SLOT_MINUTES)} (before the window) is rejected`,
    opts[start - SLOT_MINUTES].blockReason, 'outside_working_window');
  check(`${hhmm(start)} (window start) is allowed`, opts[start].blockReason, null);
  check(`${hhmm(end - SLOT_MINUTES)} (last slot inside) is allowed`,
    opts[end - SLOT_MINUTES].blockReason, null);
  check(`${hhmm(end)} (window end) is rejected`, opts[end].blockReason, 'outside_working_window');

  // A lesson that STARTS inside but ENDS outside is still outside.
  const sixty = byStart(build({ durationMinutes: 60, availability: win(start, end) }));
  check(`60-min starting at ${hhmm(end - SLOT_MINUTES)} overruns the window`,
    sixty[end - SLOT_MINUTES].blockReason, 'outside_working_window');
  check(`   60-min starting at ${hhmm(end - 2 * SLOT_MINUTES)} fits exactly`,
    sixty[end - 2 * SLOT_MINUTES].blockReason, null);

  // Two disjoint shifts merge into two windows; the gap between them is not
  // workable even though both sides are.
  const split = byStart(build({
    durationMinutes: 30,
    availability: [...win(12 * 60, 14 * 60), ...win(16 * 60, 18 * 60)],
  }));
  check('12:30 inside the first window is allowed', split[12 * 60 + 30].blockReason, null);
  check('14:30 in the gap is rejected', split[14 * 60 + 30].blockReason, 'outside_working_window');
  check('16:30 inside the second window is allowed', split[16 * 60 + 30].blockReason, null);
}

{
  // No availability configured must not read as "unavailable everywhere" —
  // the same rule computeRowLayout uses to gate shift-aware shading.
  const opts = build({ availability: [] });
  const windowBlocked = opts.filter((o) => o.blockReason === 'outside_working_window');
  check('no configured window blocks nothing on window grounds', windowBlocked.length, 0);
}

console.log();
console.log('='.repeat(78));
console.log('OTHER LESSONS OCCUPY TIME — OVERLAP, NOT EQUALITY');
console.log('='.repeat(78));

{
  // A 30-minute lesson already sits at 16:00-16:30.
  const other = [{ startMinute: 16 * 60, endMinute: 16 * 60 + 30 }];
  const opts = byStart(build({ durationMinutes: 30, availability: [], otherLessons: other }));
  check('16:00 (exact overlap) is rejected', opts[16 * 60].blockReason, 'overlaps_lesson');
  check('15:30 (ends exactly when it starts) is allowed', opts[15 * 60 + 30].blockReason, null);
  check('16:30 (starts exactly when it ends) is allowed', opts[16 * 60 + 30].blockReason, null);

  // A 60-minute lesson starting at 15:30 would run into it.
  const sixty = byStart(build({ durationMinutes: 60, availability: [], otherLessons: other }));
  check('60-min at 15:30 reaches into the booked slot', sixty[15 * 60 + 30].blockReason, 'overlaps_lesson');
  check('60-min at 16:30 clears it', sixty[16 * 60 + 30].blockReason, null);

  // A 40-minute booked lesson is not slot-aligned; partial overlap still counts.
  const ragged = [{ startMinute: 16 * 60, endMinute: 16 * 60 + 40 }];
  const r = byStart(build({ durationMinutes: 30, availability: [], otherLessons: ragged }));
  check('16:30 overlaps a 16:00-16:40 lesson by 10 minutes', r[16 * 60 + 30].blockReason, 'overlaps_lesson');
  check('17:00 clears a 16:00-16:40 lesson', r[17 * 60].blockReason, null);
}

console.log();
console.log('='.repeat(78));
console.log('REJECTED CANDIDATES ARE RETURNED, NOT DROPPED');
console.log('='.repeat(78));

{
  const opts = build({ durationMinutes: 30, availability: win(14 * 60, 18 * 60) });
  check('the list still spans the whole timeline', opts.length, GRID_COLUMNS.length);
  check('   some are blocked', opts.some((o) => !o.isSelectable), true);
  check('   every blocked option states a reason',
    opts.filter((o) => !o.isSelectable).every((o) => o.blockReason !== null), true);
  check('   every selectable option has no reason',
    opts.filter((o) => o.isSelectable).every((o) => o.blockReason === null), true);
}

console.log();
console.log(results.join('\n'));
console.log('-'.repeat(78));
console.log(`TOTAL: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

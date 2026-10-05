/**
 * Timeline viewport (8:00 AM – 8:00 PM), 12-hour formatting, and the
 * free-time alert states.
 *
 * Fixtures only — no database, no production lesson records.
 *
 * The free-time *colour* is a CSS class and is asserted in the Playwright
 * layout suite; what is asserted here is the thing the colour is driven by:
 * which intervals qualify as "inside the working window with no lesson".
 */
import { minuteToDisplayLabel, minuteToLabel } from './timeGrid.mjs';
import { GRID_START_MINUTE, GRID_END_MINUTE, GRID_COLUMNS, SLOT_MINUTES } from './schedulingConstants.mjs';
import { computeRowLayout } from './computeRowLayout.mjs';
import { minuteToX, timelineWidth } from './timelineGeometry.mjs';

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
const slot = (s, e) => [{ teacherId: 'T', dayOfWeek: 0, startMinute: s, endMinute: e, timezone: 'Asia/Dubai', source: 'shift' }];
let seq = 0;
const lesson = (s, dur) => ({ id: `L${++seq}`, teacherId: 'T', dayOfWeek: 0, startMinute: s, durationMinutes: dur, endMinute: s + dur, participants: [] });

const FULL = [12 * 60, 19 * 60];   // 12:00 PM – 7:00 PM
const PART = [14 * 60, 18 * 60];   // 2:00 PM – 6:00 PM

console.log('='.repeat(78));
console.log('7 + 8 · TIMELINE RANGE = 8:00 AM -> 8:00 PM');
console.log('='.repeat(78));

check('7  viewport starts at 8:00 AM', GRID_START_MINUTE, 480);
check('8  viewport ends at 8:00 PM', GRID_END_MINUTE, 1200);
check('   granularity is still 30 minutes', SLOT_MINUTES, 30);
check('   24 columns span the viewport', GRID_COLUMNS.length, 24);
check('   first column is 8:00 AM', minuteToDisplayLabel(GRID_COLUMNS[0]), '8:00 AM');
check('   last column is 7:30 PM (8:00 PM is the closing edge)',
  minuteToDisplayLabel(GRID_COLUMNS[GRID_COLUMNS.length - 1]), '7:30 PM');
check('   closing edge renders as 8:00 PM', minuteToDisplayLabel(GRID_END_MINUTE), '8:00 PM');

// The exact header sequence an admin should see.
check('   full header label sequence',
  GRID_COLUMNS.map(minuteToDisplayLabel),
  ['8:00 AM','8:30 AM','9:00 AM','9:30 AM','10:00 AM','10:30 AM','11:00 AM','11:30 AM',
   '12:00 PM','12:30 PM','1:00 PM','1:30 PM','2:00 PM','2:30 PM','3:00 PM','3:30 PM',
   '4:00 PM','4:30 PM','5:00 PM','5:30 PM','6:00 PM','6:30 PM','7:00 PM','7:30 PM']);
check('   no 24-hour label leaks into the header',
  GRID_COLUMNS.map(minuteToDisplayLabel).some((l) => /^(1[3-9]|2[0-3]):/.test(l)), false);

console.log('='.repeat(78));
console.log('6 · 12-HOUR FORMATTING, ESPECIALLY AROUND NOON AND MIDNIGHT');
console.log('='.repeat(78));

for (const [minute, want] of [
  [0, '12:00 AM'], [30, '12:30 AM'], [8 * 60, '8:00 AM'], [11 * 60, '11:00 AM'],
  [11 * 60 + 30, '11:30 AM'], [12 * 60, '12:00 PM'], [12 * 60 + 30, '12:30 PM'],
  [13 * 60, '1:00 PM'], [13 * 60 + 30, '1:30 PM'], [18 * 60, '6:00 PM'],
  [19 * 60, '7:00 PM'], [20 * 60, '8:00 PM'], [23 * 60 + 59, '11:59 PM'],
]) {
  check(`6  ${hhmm(minute)} -> "${want}"`, minuteToDisplayLabel(minute), want);
}
check('6  noon is 12 PM, not 0 PM', minuteToDisplayLabel(720).startsWith('12:'), true);
check('6  midnight is 12 AM, not 0 AM', minuteToDisplayLabel(0).startsWith('12:'), true);
check('6  minutes stay zero-padded', minuteToDisplayLabel(13 * 60 + 5), '1:05 PM');

// Every afternoon hour an admin could mistake for 24-hour notation. These are
// the exact labels the previous build was reported to be showing.
for (const [h24, want] of [[13, '1:00 PM'], [14, '2:00 PM'], [15, '3:00 PM'], [16, '4:00 PM'],
                           [17, '5:00 PM'], [18, '6:00 PM'], [19, '7:00 PM'], [20, '8:00 PM']]) {
  check(`11  internal ${h24}:00 renders as "${want}", never "${h24}:00"`, minuteToDisplayLabel(h24 * 60), want);
}
check('11  8:00 internal renders as "8:00 AM"', minuteToDisplayLabel(8 * 60), '8:00 AM');
check('11  12:00 internal renders as "12:00 PM"', minuteToDisplayLabel(12 * 60), '12:00 PM');
check('11  no header label matches a 24-hour pattern',
  GRID_COLUMNS.map(minuteToDisplayLabel).filter((l) => /^(1[3-9]|2[0-3]):[0-5]\d/.test(l)), []);

// The 24-hour formatter must be untouched — <input type="time"> depends on it.
check('   minuteToLabel still returns 24h "HH:MM" for form round-trips', minuteToLabel(13 * 60 + 30), '13:30');
check('   minuteToLabel still zero-pads the hour', minuteToLabel(8 * 60), '08:00');

console.log('='.repeat(78));
console.log('1-5 · FREE-TIME ALERT STATES');
console.log('='.repeat(78));

// 1. Inside shift + no lesson => flagged free (red).
{
  const layout = computeRowLayout([], slot(...FULL));
  check('1  full-time, no lessons => whole 12:00-19:00 flagged free', fmt(layout.freeIntervals), ['12:00-19:00']);
  check('B  (edge) entire working window is free when there are no lessons',
    layout.freeIntervals.length === 1 && layout.freeIntervals[0].startMinute === 720 && layout.freeIntervals[0].endMinute === 1140, true);
}

// The worked example from the request.
{
  const lessons = [lesson(12 * 60, 30), lesson(13 * 60, 30), lesson(14 * 60, 30), lesson(16 * 60, 30)];
  const layout = computeRowLayout(lessons, slot(...FULL));
  check('1  worked example gaps flagged free',
    fmt(layout.freeIntervals), ['12:30-13:00', '13:30-14:00', '14:30-16:00', '16:30-19:00']);
}

// 2. Inside shift + lesson => NOT flagged under the lesson.
{
  const layout = computeRowLayout([lesson(13 * 60, 60)], slot(...FULL));
  check('2  no free band overlaps the lesson',
    layout.freeIntervals.some((f) => f.startMinute < 14 * 60 && f.endMinute > 13 * 60), false);
  check('2  free bands sit either side of it', fmt(layout.freeIntervals), ['12:00-13:00', '14:00-19:00']);
}

// A. Lesson exactly fills the shift => no free area at all.
{
  const layout = computeRowLayout([lesson(FULL[0], FULL[1] - FULL[0])], slot(...FULL));
  check('A  lesson filling the whole shift leaves no free area', layout.freeIntervals, []);
}

// 3 + D. Outside shift + no lesson => never flagged.
{
  const layout = computeRowLayout([], slot(...FULL));
  check('3  nothing flagged before the shift (08:00-12:00)',
    layout.freeIntervals.some((f) => f.startMinute < 720), false);
  check('D  nothing flagged after the shift (19:00-20:00)',
    layout.freeIntervals.some((f) => f.endMinute > 1140), false);
  check('3  08:00 column is outside the window', layout.columnInWindow[(480 - 480) / 30], false);
  check('D  19:00 column is outside the window', layout.columnInWindow[(1140 - 480) / 30], false);
}

// C. Lesson partially overlapping a 30-min slot — no red under it.
{
  const layout = computeRowLayout([lesson(13 * 60 + 10, 40)], slot(...FULL)); // 13:10-13:50
  check('C  partial-slot lesson subtracts exactly its own minutes',
    fmt(layout.freeIntervals), ['12:00-13:10', '13:50-19:00']);
  check('C  free minutes = 420 - 40', layout.freeIntervals.reduce((n, f) => n + (f.endMinute - f.startMinute), 0), 380);
}

// A lesson straddling the shift start contributes only its in-window part.
{
  const layout = computeRowLayout([lesson(11 * 60 + 30, 60)], slot(...FULL)); // 11:30-12:30
  check('   straddling lesson: only 12:00-12:30 is consumed', fmt(layout.freeIntervals), ['12:30-19:00']);
}

// 4 + 5 + E + F. Both groups, bounded by their own window.
{
  const full = computeRowLayout([], slot(...FULL));
  const part = computeRowLayout([], slot(...PART));
  check('4/F  full-time can only flag within 12:00-19:00',
    full.freeIntervals.every((f) => f.startMinute >= 720 && f.endMinute <= 1140), true);
  check('5/E  part-time can only flag within 14:00-18:00',
    part.freeIntervals.every((f) => f.startMinute >= 840 && f.endMinute <= 1080), true);
  check('5/E  part-time flags nothing at 12:00 (full-time-only hours)',
    part.columnInWindow[(720 - 480) / 30], false);
  check('4/F  full-time flags 12:00', full.columnInWindow[(720 - 480) / 30], true);
}

// G. A re-configured window immediately changes what can be flagged.
{
  for (const [s, e, label] of [[11 * 60, 19 * 60, '11:00-19:00'], [12 * 60, 20 * 60, '12:00-20:00'], [15 * 60, 18 * 60, '15:00-18:00']]) {
    const layout = computeRowLayout([], slot(s, e));
    check(`G  window ${label} flags exactly itself`, fmt(layout.freeIntervals), [label]);
    check(`G  window ${label} column count`, layout.columnInWindow.filter(Boolean).length, (e - s) / 30);
  }
}

// A teacher with no configured window never flags anything.
{
  const layout = computeRowLayout([lesson(13 * 60, 30)], []);
  check('   no working window => no free-time alert at all', layout.freeIntervals, []);
  check('   no working window => no column marked in-window', layout.columnInWindow.some(Boolean), false);
}

console.log('='.repeat(78));
console.log('4 · GEOMETRY STILL ALIGNS ON THE NEW VIEWPORT');
console.log('='.repeat(78));

for (const cw of [40, 61, 96]) {
  let drift = 0;
  for (let k = 0; k < GRID_COLUMNS.length; k++) {
    drift = Math.max(drift, Math.abs(k * cw - minuteToX(GRID_START_MINUTE + k * SLOT_MINUTES, cw)));
  }
  check(`4  cw=${cw}: zero header/geometry drift across all ${GRID_COLUMNS.length} columns`, drift, 0);
  check(`4  cw=${cw}: timelineWidth == ${GRID_COLUMNS.length} * cw`, timelineWidth(cw), GRID_COLUMNS.length * cw);
  check(`4  cw=${cw}: 8:00 AM is the origin`, minuteToX(480, cw), 0);
  check(`4  cw=${cw}: 8:00 PM is the far edge`, minuteToX(1200, cw), GRID_COLUMNS.length * cw);
  check(`4  cw=${cw}: a 40-min lesson stays proportional`,
    Math.abs((minuteToX(16 * 60 + 40, cw) - minuteToX(16 * 60, cw)) - (40 * cw) / 30) < 1e-9, true);
}

console.log('\n' + results.join('\n'));
console.log('\n' + '='.repeat(78));
console.log(`TOTAL: ${pass} passed, ${fail} failed`);
console.log('='.repeat(78));
process.exit(fail === 0 ? 0 : 1);

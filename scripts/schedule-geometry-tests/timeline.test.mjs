import {
  minuteToX, minuteSpanToWidth, timelineWidth,
  computeFreeIntervals, computeWorkingWindow, mergeIntervals, subtractIntervals,
} from './timelineGeometry.mjs';
import { computeRowLayout } from './computeRowLayout.mjs';

const GRID_START = 8 * 60;   // 08:00 — viewport start (schedulingConstants)
const SLOT = 30;
const GRID_END = 24 * 60;    // 24:00 — viewport end (schedulingConstants)
const COLS = (GRID_END - GRID_START) / SLOT; // 32 columns (08:00-24:00)

let pass = 0, fail = 0;
const results = [];

function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}` + (ok ? '' : `\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`));
}

const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const iv = (s, e) => ({ startMinute: s, endMinute: e });
const fmt = (list) => list.map((i) => `${hhmm(i.startMinute)}-${hhmm(i.endMinute)}`);
const lesson = (id, startMinute, durationMinutes) => ({ id, startMinute, durationMinutes, participants: [] });

// Shifts under test
const SHIFT = [iv(14 * 60, 19 * 60)];       // 840-1140
const PART  = [iv(14 * 60, 18 * 60)];       // 840-1080

console.log('='.repeat(78));
console.log('REQUIREMENT 3 / F / G / H — canonical header↔lesson alignment');
console.log('='.repeat(78));

// Every 30-min header boundary must land exactly on its column edge, for a
// range of responsive column widths (incl. the 40px minimum and 96px default).
for (const columnWidth of [40, 48, 61, 96, 120]) {
  let maxDrift = 0;
  for (let k = 0; k < COLS; k++) {
    const boundaryMinute = GRID_START + k * SLOT;
    const headerEdge = k * columnWidth;              // header: k fixed-width cells
    const geometryX = minuteToX(boundaryMinute, columnWidth);
    maxDrift = Math.max(maxDrift, Math.abs(headerEdge - geometryX));
  }
  check(`R3 header/geometry drift across all ${COLS} boundaries @ columnWidth=${columnWidth}px`, maxDrift, 0);
  check(`R3 timelineWidth == ${COLS} * columnWidth @ ${columnWidth}px`, timelineWidth(columnWidth), COLS * columnWidth);
}

// TEST 7 — 30-min lesson at 15:30 aligns exactly with the 15:30 header slot.
{
  const cw = 96, start = 15 * 60 + 30, dur = 30;
  const colIndex = (start - GRID_START) / SLOT; // 17
  check('TEST 7  15:30 lesson left edge == 15:30 header column left edge',
    minuteToX(start, cw), colIndex * cw);
  check('TEST 7  30-min lesson width == exactly one 30-min column (G)',
    minuteSpanToWidth(start, start + dur, cw), cw);
  check('TEST 7  15:30 lesson right edge == 16:00 header column left edge',
    minuteToX(start, cw) + minuteSpanToWidth(start, start + dur, cw), minuteToX(16 * 60, cw));
}

// TEST 8 — 40-min lesson at 16:00 ends exactly at 16:40 (not rounded to 17:00).
{
  const cw = 96, start = 16 * 60, dur = 40;
  const right = minuteToX(start, cw) + minuteSpanToWidth(start, start + dur, cw);
  check('TEST 8  40-min lesson right edge == x(16:40)', right, minuteToX(16 * 60 + 40, cw));
  check('TEST 8  40-min width is proportional (40/30 of a column), NOT snapped to 2 columns (H)',
    minuteSpanToWidth(start, start + dur, cw), (40 * cw) / 30);
  check('TEST 8  40-min width != 2 columns (the old Math.ceil behaviour)',
    minuteSpanToWidth(start, start + dur, cw) === 2 * cw, false);
}

// Off-grid start (legacy import produces :40 starts) stays exact.
{
  const cw = 96, start = 16 * 60 + 40, dur = 40;
  check('off-grid 16:40 start is positioned exactly, not snapped to 16:30',
    minuteToX(start, cw), ((16 * 60 + 40 - GRID_START) * cw) / SLOT);
  check('off-grid 16:40+40m right edge == x(17:20)',
    minuteToX(start, cw) + minuteSpanToWidth(start, start + dur, cw), minuteToX(17 * 60 + 20, cw));
}

console.log('='.repeat(78));
console.log('REQUIREMENT 2 / D / E — free capacity inside the shift only');
console.log('='.repeat(78));

// TEST 1 — shift 14:00-19:00, lesson 14:00-14:30
check('TEST 1  free == 14:30-19:00',
  fmt(computeFreeIntervals(SHIFT, [iv(840, 870)])), ['14:30-19:00']);

// TEST 2 — shift 14:00-19:00, lesson 16:00-16:40
check('TEST 2  free == 14:00-16:00 + 16:40-19:00',
  fmt(computeFreeIntervals(SHIFT, [iv(960, 1000)])), ['14:00-16:00', '16:40-19:00']);

// TEST 3 — three lessons, all gaps highlighted
check('TEST 3  free gaps between 14:30-15:00, 16:00-16:30, 17:30-18:00',
  fmt(computeFreeIntervals(SHIFT, [iv(870, 900), iv(960, 990), iv(1050, 1080)])),
  ['14:00-14:30', '15:00-16:00', '16:30-17:30', '18:00-19:00']);

// TEST 4 — part-time 14:00-18:00, no lessons
check('TEST 4  entire 14:00-18:00 free', fmt(computeFreeIntervals(PART, [])), ['14:00-18:00']);
check('TEST 4  18:00-19:00 is NOT free capacity (outside part-time shift)',
  computeFreeIntervals(PART, []).some((i) => i.endMinute > 18 * 60), false);
check('TEST 4  13:00-14:00 is NOT free capacity (before shift start)',
  computeFreeIntervals(PART, []).some((i) => i.startMinute < 14 * 60), false);

// Requirement E, full-shift teacher
check('R2/E  shift teacher: nothing free before 14:00 or after 19:00',
  computeFreeIntervals(SHIFT, []).every((i) => i.startMinute >= 840 && i.endMinute <= 1140), true);

// Fully booked shift -> no free capacity at all
check('R2  fully-booked 14:00-19:00 yields no free capacity',
  computeFreeIntervals(SHIFT, [iv(840, 1140)]), []);

// Lesson extending past the shift end is still fully subtracted
check('R2  lesson overrunning the shift end clips correctly',
  fmt(computeFreeIntervals(PART, [iv(1050, 1140)])), ['14:00-17:30']);

// SCOPING — a teacher with NO availability must produce no shading at all.
check('R1/C  teacher with no availability has empty working window',
  computeWorkingWindow([]), []);
check('R1/C  teacher with no availability has NO free bands (behaviour unchanged)',
  computeFreeIntervals([], [iv(960, 990)]), []);

// Interval algebra edge cases
check('merge: touching intervals union', fmt(mergeIntervals([iv(840, 900), iv(900, 960)])), ['14:00-16:00']);
check('merge: overlapping intervals union', fmt(mergeIntervals([iv(840, 960), iv(900, 1020)])), ['14:00-17:00']);
check('merge: zero-length dropped', mergeIntervals([iv(900, 900)]), []);
check('subtract: cut fully covering base', subtractIntervals([iv(840, 900)], [iv(800, 1000)]), []);
check('subtract: disjoint cut leaves base', fmt(subtractIntervals([iv(840, 900)], [iv(1000, 1020)])), ['14:00-15:00']);
check('clip: availability outside the 08:00-24:00 viewport is clipped',
  fmt(computeWorkingWindow([iv(0, 600)])), ['08:00-10:00']);
// The property is unchanged — availability beyond the viewport end is
// clipped — but the probe has to actually exceed the end, which is now
// midnight. 19:00-23:00 is INSIDE the new viewport and must survive intact.
check('clip: availability past the viewport end (midnight) is clipped',
  fmt(computeWorkingWindow([iv(1380, 1500)])), ['23:00-24:00']);
check('clip: a 19:00-23:00 window is now fully inside the viewport',
  fmt(computeWorkingWindow([iv(1140, 1380)])), ['19:00-23:00']);

// Two availability slots on one day (hourly teacher with a split shift)
check('split availability: both windows kept, lesson subtracted from the right one',
  fmt(computeFreeIntervals([iv(540, 660), iv(840, 1140)], [iv(900, 930)])),
  ['09:00-11:00', '14:00-15:00', '15:30-19:00']);

console.log('='.repeat(78));
console.log('ROW LAYOUT — per-column shading flags + free bands together');
console.log('='.repeat(78));

{
  // Shift teacher 14:00-19:00 with a 40-min lesson at 16:00.
  const layout = computeRowLayout([lesson('l1', 960, 40)], SHIFT.map((i) => ({ ...i, teacherId: 't', dayOfWeek: 0, timezone: 'Asia/Dubai', source: 'shift' })));
  check('layout: hasWorkingWindow true for a configured teacher', layout.hasWorkingWindow, true);
  check('layout: free bands == 14:00-16:00 + 16:40-19:00', fmt(layout.freeIntervals), ['14:00-16:00', '16:40-19:00']);

  // columnInWindow: 07:00 .. 23:30 -> true only for 14:00-18:30 columns
  const inWindowCols = layout.columnInWindow
    .map((v, i) => (v ? hhmm(GRID_START + i * SLOT) : null))
    .filter(Boolean);
  check('layout: columns inside the 14:00-19:00 window are exactly 14:00..18:30',
    inWindowCols, ['14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30']);
  check('layout: 13:30 column is outside the shift', layout.columnInWindow[(13 * 60 + 30 - GRID_START) / SLOT], false);
  check('layout: 19:00 column is outside the shift', layout.columnInWindow[(19 * 60 - GRID_START) / SLOT], false);
}

{
  // Part-timer 14:00-18:00
  const layout = computeRowLayout([], PART.map((i) => ({ ...i, teacherId: 't', dayOfWeek: 0, timezone: 'Asia/Dubai', source: 'shift' })));
  check('layout(part-time): 17:30 column inside window', layout.columnInWindow[(17 * 60 + 30 - GRID_START) / SLOT], true);
  check('layout(part-time): 18:00 column OUTSIDE window (E)', layout.columnInWindow[(18 * 60 - GRID_START) / SLOT], false);
  check('layout(part-time): 18:30 column OUTSIDE window (E)', layout.columnInWindow[(18 * 60 + 30 - GRID_START) / SLOT], false);
}

{
  // Legacy teacher: no availability at all -> nothing shaded as in/out of shift.
  const layout = computeRowLayout([lesson('l2', 960, 30)], []);
  check('layout(legacy, no availability): hasWorkingWindow false', layout.hasWorkingWindow, false);
  check('layout(legacy, no availability): no free bands', layout.freeIntervals, []);
  check('layout(legacy, no availability): no column marked in-window', layout.columnInWindow.some(Boolean), false);
}

console.log('\n' + results.join('\n'));
console.log('\n' + '='.repeat(78));
console.log(`TOTAL: ${pass} passed, ${fail} failed`);
console.log('='.repeat(78));
process.exit(fail === 0 ? 0 : 1);

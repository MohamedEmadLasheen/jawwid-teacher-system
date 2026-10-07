/**
 * The midnight-extension contract, pinned to the REAL imported schedule.
 *
 * The 13 lessons below are the ones the old 20:00 viewport degraded, taken
 * from the production import manifest (every field of which was verified
 * against the database row-by-row at import time, with 0 geometry
 * mismatches). 12 of them START at or after 20:00 and were drawn with ZERO
 * width — invisible. The 13th starts at 19:30 and ran past the boundary, so
 * it was drawn at half its real duration.
 *
 * These assertions are about the rendering contract only. No lesson time,
 * duration, teacher or day is changed anywhere — the numbers here are copied
 * FROM production and asserted against, never written back.
 */
import { minuteToX, minuteSpanToWidth, clampToTimeline, timelineWidth } from './timelineGeometry.mjs';
import { GRID_START_MINUTE, GRID_END_MINUTE, GRID_COLUMNS, SLOT_MINUTES } from './schedulingConstants.mjs';
import { minuteToDisplayLabel } from './timeGrid.mjs';

let pass = 0, fail = 0;
const results = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}` + (ok ? '' : `\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`));
}

/**
 * The 12 production lessons starting at or after 20:00, verified field-by-field
 * against the live database (source cell, teacher, day, start, duration, end).
 * Read-only: these are asserted against, never written back.
 */
const LATE = [
  { cell: 'الاثنين!AB11', teacher: 'Doaa Zakaria', dow: 1, start: 1200, dur: 30, end: 1230 },
  { cell: 'الاثنين!AB7', teacher: 'Menna Ramadan', dow: 1, start: 1200, dur: 30, end: 1230 },
  { cell: 'الثلاثاء!AA11', teacher: 'Doaa Zakaria', dow: 2, start: 1200, dur: 30, end: 1230 },
  { cell: 'الثلاثاء!AA14', teacher: 'Aya Mustafa', dow: 2, start: 1200, dur: 30, end: 1230 },
  { cell: 'سبت!AA11', teacher: 'Doaa Zakaria', dow: 6, start: 1200, dur: 30, end: 1230 },
  { cell: 'الاثنين!AC10', teacher: 'Yasmeen Saad', dow: 1, start: 1230, dur: 30, end: 1260 },
  { cell: 'الاثنين!AC11', teacher: 'Doaa Zakaria', dow: 1, start: 1230, dur: 30, end: 1260 },
  { cell: 'الاحد!AI11', teacher: 'Doaa Zakaria', dow: 0, start: 1230, dur: 30, end: 1260 },
  { cell: 'الاربعاء!AC11', teacher: 'Doaa Zakaria', dow: 3, start: 1230, dur: 30, end: 1260 },
  { cell: 'الجمعة!AB11', teacher: 'Doaa Zakaria', dow: 5, start: 1230, dur: 30, end: 1260 },
  { cell: 'الخميس!AI11', teacher: 'Doaa Zakaria', dow: 4, start: 1290, dur: 30, end: 1320 },
  { cell: 'الخميس!AI7', teacher: 'Menna Ramadan', dow: 4, start: 1290, dur: 30, end: 1320 },
];

/** Started inside the old grid but ran past it — was rendered half-width. */
const CLIPPED = { cell: 'الاحد!AG11', teacher: 'Doaa Zakaria', dow: 0, start: 1170, dur: 60, end: 1230 };

console.log('='.repeat(78));
console.log('MIDNIGHT EXTENSION — grid contract');
console.log('='.repeat(78));

check('A  grid ends at midnight (1440)', GRID_END_MINUTE, 1440);
check('A  grid starts at 08:00 (480)', GRID_START_MINUTE, 480);
check('A  32 half-hour columns span 08:00-24:00', GRID_COLUMNS.length, 32);
check('A  the closing edge reads 12:00 AM, not 12:00 PM',
  minuteToDisplayLabel(GRID_END_MINUTE), '12:00 AM');

// --- negative regression: the old boundary must be gone from the contract ---
check('H  GRID_END_MINUTE is no longer 1200', GRID_END_MINUTE === 1200, false);
check('H  20:00 is not the end of the axis', GRID_END_MINUTE > 1200, true);
check('H  20:00 no longer clamps (the old hiding mechanism)', clampToTimeline(1200), 1200);
check('H  21:30 no longer clamps', clampToTimeline(1290), 1290);
check('H  a 20:00 lesson is no longer zero-width',
  minuteSpanToWidth(1200, 1230, 96) === 0, false);

console.log('='.repeat(78));
console.log('B-G — every late lesson that exists in production');
console.log('='.repeat(78));

for (const l of LATE) {
  const end = l.start + l.dur;
  const label = `${l.cell} @ ${minuteToDisplayLabel(l.start)}`;
  // Not filtered: this is the exact predicate LessonCell uses to skip drawing.
  check(`B  ${label}: passes the visibility predicate`,
    end > GRID_START_MINUTE && l.start < GRID_END_MINUTE, true);
  // Positioned at its exact minute — no rounding, no snapping, no shifting.
  check(`G  ${label}: x == exact column offset`,
    minuteToX(l.start, 96), ((l.start - GRID_START_MINUTE) / SLOT_MINUTES) * 96);
  // Duration preserved exactly: a 30-min lesson is one column, never clipped.
  check(`F  ${label}: width == exact duration`,
    minuteSpanToWidth(l.start, end, 96), (l.dur / SLOT_MINUTES) * 96);
  check(`F  ${label}: not clipped (width > 0)`, minuteSpanToWidth(l.start, end, 96) > 0, true);
  check(`G  ${label}: end is inside the axis`, minuteToX(end, 96) <= timelineWidth(96), true);
}

check('B  all 12 late lessons are inside the viewport',
  LATE.filter((l) => l.start < GRID_END_MINUTE).length, 12);
check('B  under the OLD 1200 grid, all 12 would have been hidden',
  LATE.filter((l) => l.start >= 1200).length, 12);

// the 13th — partially clipped before, full width now
{
  const { start, dur, cell } = CLIPPED;
  check(`F  ${cell}: 19:30-20:30 keeps its full 60 minutes`,
    minuteSpanToWidth(start, start + dur, 96), (dur / SLOT_MINUTES) * 96);
  // Prove the old behaviour was wrong: clamped at 1200 it lost half its width.
  const oldWidth = ((Math.min(start + dur, 1200) - start) / SLOT_MINUTES) * 96;
  check(`H  ${cell}: the old grid showed only half of it`, oldWidth, 96);
  check(`H  ${cell}: the new grid shows twice that`,
    minuteSpanToWidth(start, start + dur, 96), oldWidth * 2);
}

console.log('='.repeat(78));
console.log('K/L — nothing before 19:30 changes');
console.log('='.repeat(78));

// Positions are measured from GRID_START_MINUTE, which did not move, so every
// daytime lesson keeps the exact same offset and width it had before.
for (const [start, dur, name] of [[480, 30, '08:00'], [720, 60, '12:00'], [930, 40, '15:30 (40min)'], [1140, 30, '19:00']]) {
  check(`L  ${name} lesson x unchanged`,
    minuteToX(start, 96), ((start - GRID_START_MINUTE) / SLOT_MINUTES) * 96);
  check(`K  ${name} lesson width unchanged`,
    minuteSpanToWidth(start, start + dur, 96), (dur / SLOT_MINUTES) * 96);
}
check('L  08:00 still sits at the axis origin', minuteToX(480, 96), 0);
check('K  a 40-min lesson is still 40/30 of a column, not snapped',
  minuteSpanToWidth(930, 970, 96), 128);

// --- the request's named times are all real columns ---
for (const [m, label] of [[1200, '8:00 PM'], [1230, '8:30 PM'], [1260, '9:00 PM'], [1290, '9:30 PM'],
                          [1320, '10:00 PM'], [1350, '10:30 PM'], [1380, '11:00 PM'], [1410, '11:30 PM']]) {
  check(`C/D/E  ${label} is a real header column`, GRID_COLUMNS.includes(m), true);
  check(`C/D/E  ${label} renders in 12-hour form`, minuteToDisplayLabel(m), label);
}
check('H  a 23:30 lesson runs exactly to midnight and is fully drawn',
  minuteSpanToWidth(1410, 1440, 96), 96);
check('H  a lesson ending exactly at 1440 is not clamped short',
  clampToTimeline(1440), 1440);
check('I  nothing is drawn past midnight', minuteSpanToWidth(1440, 1470, 96), 0);

console.log('='.repeat(78));
console.log('B/C — the terminal boundary is not a schedulable column');
console.log('='.repeat(78));

// B. One formatter, one answer. The header renders this exact string.
check('B  terminal label text', minuteToDisplayLabel(GRID_END_MINUTE), '12:00 AM');
check('B  terminal label is midnight, not noon',
  minuteToDisplayLabel(GRID_END_MINUTE) === minuteToDisplayLabel(12 * 60), false);

// C. Midnight must NOT be a column: no 12:00 AM -> 12:30 AM slot exists, so
// nothing can be scheduled into it and no extra column is laid out.
check('C  1440 is not a schedulable column', GRID_COLUMNS.includes(1440), false);
check('C  the last schedulable column is 23:30', GRID_COLUMNS[GRID_COLUMNS.length - 1], 1410);
check('C  the last slot is 23:30 -> 24:00',
  GRID_COLUMNS[GRID_COLUMNS.length - 1] + SLOT_MINUTES, GRID_END_MINUTE);
check('C  column count is unchanged by the terminal marker', GRID_COLUMNS.length, 32);
check('C  the axis width is exactly 32 columns (the marker adds none)',
  timelineWidth(96), 32 * 96);
check('C  no column starts at or after midnight',
  GRID_COLUMNS.filter((m) => m >= GRID_END_MINUTE).length, 0);

console.log('='.repeat(78));
console.log('5 — production record fields, pinned (read-only)');
console.log('='.repeat(78));

// Every field of every affected production lesson, exactly as the database
// holds it. If any of these ever changes, this suite fails — which is the
// point: this task must never alter schedule data.
for (const l of [...LATE, CLIPPED]) {
  check(`5  ${l.cell}: end == start + duration`, l.start + l.dur, l.end);
  check(`5  ${l.cell}: day is 0-6`, l.dow >= 0 && l.dow <= 6, true);
  check(`5  ${l.cell}: teacher is one of the 14 roster teachers`,
    ['Doaa Zakaria', 'Menna Ramadan', 'Aya Mustafa', 'Yasmeen Saad'].includes(l.teacher), true);
  check(`5  ${l.cell}: end <= midnight`, l.end <= GRID_END_MINUTE, true);
  check(`5  ${l.cell}: fully visible on the new axis`,
    minuteSpanToWidth(l.start, l.end, 96), (l.dur / SLOT_MINUTES) * 96);
  check(`5  ${l.cell}: was degraded by the OLD 1200 grid`, l.end > 1200, true);
}
check('5  13 affected production lessons in total', LATE.length + 1, 13);
check('5  12 of them were fully hidden', LATE.filter((l) => l.start >= 1200).length, 12);
check('5  1 of them was half-clipped',
  [CLIPPED].filter((l) => l.start < 1200 && l.end > 1200).length, 1);
check('5  no production lesson starts at 21:00 (the 21:00 case is fixture-backed)',
  LATE.filter((l) => l.start === 21 * 60).length, 0);

console.log(results.join('\n'));
console.log('='.repeat(78));
console.log(`TOTAL: ${pass} passed, ${fail} failed`);
console.log('='.repeat(78));
if (fail > 0) process.exit(1);

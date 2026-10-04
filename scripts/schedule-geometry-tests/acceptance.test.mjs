/**
 * Acceptance criteria for the scheduling system, proven from TEACHER
 * AVAILABILITY ALONE plus controlled fixtures.
 *
 * Deliberately independent of any production lesson record: the legacy
 * lesson data is invalid and scheduled for deletion, so it must not inform
 * the design or the acceptance of this system. Every lesson below is a
 * fixture defined in this file.
 */
import {
  minuteToX, minuteSpanToWidth, timelineWidth,
  computeFreeIntervals, computeWorkingWindow,
} from './timelineGeometry.mjs';
import { computeRowLayout } from './computeRowLayout.mjs';

const GRID_START = 7 * 60;
const SLOT = 30;
const COLS = (24 * 60 - GRID_START) / SLOT;

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
const freeMinutes = (l) => l.reduce((n, i) => n + (i.endMinute - i.startMinute), 0);

/** A unified-availability slot exactly as v_teacher_availability_unified yields it. */
const slot = (startMinute, endMinute, teacherId = 'T') => ({
  teacherId, dayOfWeek: 0, startMinute, endMinute, timezone: 'Asia/Dubai', source: 'shift',
});
/** A lesson fixture with the same field names the lessons service produces. */
let seq = 0;
const lesson = (startMinute, durationMinutes) => ({
  id: `fixture-${++seq}`, teacherId: 'T', dayOfWeek: 0,
  startMinute, durationMinutes, endMinute: startMinute + durationMinutes,
  lifecycleStatus: 'active', participants: [],
});

const FULL = [slot(14 * 60, 19 * 60)];   // 840-1140, the approved full shift
const PART = [slot(14 * 60, 18 * 60)];   // 840-1080, the approved part-time shift

// ------------------------------------------------------------------
console.log('='.repeat(78));
console.log('1 · WORKING WINDOWS LOAD FROM THE UNIFIED AVAILABILITY SHAPE');
console.log('='.repeat(78));

check('full shift slot -> 14:00-19:00 working window', fmt(computeWorkingWindow(FULL)), ['14:00-19:00']);
check('part-time slot -> 14:00-18:00 working window', fmt(computeWorkingWindow(PART)), ['14:00-18:00']);
check('full shift weekly capacity = 5h/day', freeMinutes(computeFreeIntervals(FULL, [])) / 60, 5);
check('part-time weekly capacity = 4h/day', freeMinutes(computeFreeIntervals(PART, [])) / 60, 4);

// ------------------------------------------------------------------
console.log('='.repeat(78));
console.log('2 + 3 · EMPTY SCHEDULE SHOWS THE WHOLE WINDOW AS FREE (post-deletion state)');
console.log('='.repeat(78));

{
  const full = computeRowLayout([], FULL);
  check('empty full shift: one contiguous free band', full.freeIntervals.length, 1);
  check('empty full shift: band == 14:00-19:00', fmt(full.freeIntervals), ['14:00-19:00']);
  check('empty full shift: 10 in-window columns (5h / 30min)', full.columnInWindow.filter(Boolean).length, 10);

  const part = computeRowLayout([], PART);
  check('empty part-time: band == 14:00-18:00', fmt(part.freeIntervals), ['14:00-18:00']);
  check('empty part-time: 8 in-window columns (4h / 30min)', part.columnInWindow.filter(Boolean).length, 8);
  check('empty part-time: 18:00 column NOT in window', part.columnInWindow[(18 * 60 - GRID_START) / SLOT], false);
  check('empty part-time: nothing free after 18:00',
    part.freeIntervals.some((f) => f.endMinute > 18 * 60), false);

  // Availability rendering must not depend on any lesson existing.
  check('availability renders with lessons undefined-equivalent (empty array)',
    computeRowLayout([], FULL).hasWorkingWindow, true);
}

// ------------------------------------------------------------------
console.log('='.repeat(78));
console.log('4 · ADDING A LESSON REMOVES EXACTLY THAT INTERVAL');
console.log('='.repeat(78));

{
  // Incrementally book a clean 14:00-19:00 day and assert the free capacity
  // shrinks by exactly the lesson duration each time — never more, never less.
  let booked = [];
  let prevFree = freeMinutes(computeRowLayout(booked, FULL).freeIntervals);
  check('start: 300 free minutes', prevFree, 300);

  const steps = [
    { l: lesson(15 * 60, 30),      expectFree: ['14:00-15:00', '15:30-19:00'] },
    { l: lesson(16 * 60, 40),      expectFree: ['14:00-15:00', '15:30-16:00', '16:40-19:00'] },
    { l: lesson(17 * 60 + 30, 60), expectFree: ['14:00-15:00', '15:30-16:00', '16:40-17:30', '18:30-19:00'] },
  ];
  for (const { l, expectFree } of steps) {
    booked = [...booked, l];
    const layout = computeRowLayout(booked, FULL);
    check(`after booking ${hhmm(l.startMinute)}+${l.durationMinutes}m -> free bands`,
      fmt(layout.freeIntervals), expectFree);
    const now = freeMinutes(layout.freeIntervals);
    check(`after booking ${hhmm(l.startMinute)}+${l.durationMinutes}m -> free shrank by exactly ${l.durationMinutes}m`,
      prevFree - now, l.durationMinutes);
    prevFree = now;
  }
  check('end: 300 - (30+40+60) = 170 free minutes', prevFree, 170);

  // Removing the lessons again restores the full window (deletion path).
  check('removing all lessons restores the full window',
    fmt(computeRowLayout([], FULL).freeIntervals), ['14:00-19:00']);
}

// ------------------------------------------------------------------
console.log('='.repeat(78));
console.log('5 · 30-MIN AND 40-MIN LESSONS ARE POSITIONED AND SIZED CORRECTLY');
console.log('='.repeat(78));

for (const columnWidth of [40, 61, 96]) {
  const ppm = columnWidth / SLOT;
  // 30-minute lesson at 15:30
  check(`cw=${columnWidth}: 30-min @15:30 left == x(15:30)`,
    minuteToX(15 * 60 + 30, columnWidth), ((15 * 60 + 30 - GRID_START) * columnWidth) / SLOT);
  check(`cw=${columnWidth}: 30-min width == exactly one column`,
    minuteSpanToWidth(15 * 60 + 30, 16 * 60, columnWidth), columnWidth);
  // 40-minute lesson at 16:00
  check(`cw=${columnWidth}: 40-min @16:00 right edge == x(16:40)`,
    minuteToX(16 * 60, columnWidth) + minuteSpanToWidth(16 * 60, 16 * 60 + 40, columnWidth),
    minuteToX(16 * 60 + 40, columnWidth));
  // Width comes from subtracting two x-positions, so it carries a sub-ULP
  // float residue; what must be EXACT is the boundary alignment asserted in
  // section 7 (and the right-edge identity above), since that is what makes
  // edges visually coincide. Here we only assert the width is proportional.
  check(`cw=${columnWidth}: 40-min width is proportional to duration`,
    Math.abs(minuteSpanToWidth(16 * 60, 16 * 60 + 40, columnWidth) - 40 * ppm) < 1e-9, true);
  check(`cw=${columnWidth}: 40-min width differs from 2 columns`,
    minuteSpanToWidth(16 * 60, 16 * 60 + 40, columnWidth) === 2 * columnWidth, false);
  // 40-min lesson also subtracts exactly 40 minutes of capacity
  check(`cw=${columnWidth}: 40-min lesson removes 40 min of capacity`,
    300 - freeMinutes(computeRowLayout([lesson(16 * 60, 40)], FULL).freeIntervals), 40);
}

// ------------------------------------------------------------------
console.log('='.repeat(78));
console.log('6 · OUT-OF-WINDOW LESSONS STAY VISIBLE BUT NEVER COUNT AS CAPACITY');
console.log('='.repeat(78));

{
  const before = lesson(12 * 60, 30);          // 12:00, before a 14:00 shift
  const after = lesson(20 * 60, 30);           // 20:00, after a 19:00 shift
  const straddling = lesson(13 * 60 + 30, 60); // 13:30-14:30, crosses the shift start

  const layout = computeRowLayout([before, after, straddling], FULL);
  check('out-of-window lessons do not add capacity: free starts at 14:30',
    fmt(layout.freeIntervals), ['14:30-19:00']);
  check('only the in-window part of a straddling lesson is subtracted (30 of 60 min)',
    300 - freeMinutes(layout.freeIntervals), 30);
  check('no free band before the shift start', layout.freeIntervals.some((f) => f.startMinute < 14 * 60), false);
  check('no free band after the shift end', layout.freeIntervals.some((f) => f.endMinute > 19 * 60), false);

  // Visibility: positioning is independent of the working window, so an
  // out-of-window lesson still has a real on-grid position and width.
  check('12:00 lesson still has a valid on-grid position', minuteToX(12 * 60, 96) > 0, true);
  check('12:00 lesson still has its full 30-min width', minuteSpanToWidth(12 * 60, 12 * 60 + 30, 96), 96);
  check('20:00 lesson still has its full 30-min width', minuteSpanToWidth(20 * 60, 20 * 60 + 30, 96), 96);

  // Part-time teacher: an 18:00-19:00 lesson is outside the window entirely.
  check('part-time: 18:30 lesson removes no capacity',
    240 - freeMinutes(computeRowLayout([lesson(18 * 60 + 30, 30)], PART).freeIntervals), 0);
}

// ------------------------------------------------------------------
console.log('='.repeat(78));
console.log('7 · HEADER / GRID / AVAILABILITY BANDS SHARE ONE COORDINATE SYSTEM');
console.log('='.repeat(78));

for (const columnWidth of [40, 48, 61, 96, 120]) {
  let maxDrift = 0;
  for (let k = 0; k < COLS; k++) {
    maxDrift = Math.max(maxDrift,
      Math.abs(k * columnWidth - minuteToX(GRID_START + k * SLOT, columnWidth)));
  }
  check(`cw=${columnWidth}: header boundary drift across all ${COLS} columns`, maxDrift, 0);
  check(`cw=${columnWidth}: timelineWidth == ${COLS} * columnWidth`, timelineWidth(columnWidth), COLS * columnWidth);

  // The availability band edges land on the same coordinates as the header.
  const band = computeRowLayout([], FULL).freeIntervals[0];
  check(`cw=${columnWidth}: free band left == x(14:00)`,
    minuteToX(band.startMinute, columnWidth), ((14 * 60 - GRID_START) * columnWidth) / SLOT);
  check(`cw=${columnWidth}: free band right == x(19:00)`,
    minuteToX(band.endMinute, columnWidth), ((19 * 60 - GRID_START) * columnWidth) / SLOT);
}

// ------------------------------------------------------------------
console.log('='.repeat(78));
console.log('10 · TEACHERS OUTSIDE THE APPROVED SCOPE ARE UNAFFECTED');
console.log('='.repeat(78));

{
  const unscoped = computeRowLayout([lesson(16 * 60, 30), lesson(9 * 60, 60)], []);
  check('no availability -> no working window', unscoped.hasWorkingWindow, false);
  check('no availability -> no free bands (nothing newly shaded)', unscoped.freeIntervals, []);
  check('no availability -> no column marked in-window', unscoped.columnInWindow.some(Boolean), false);
  check('no availability -> every column flag is false', unscoped.columnInWindow.length, COLS);
  // Their lessons keep exact geometry regardless.
  check('unscoped lesson keeps exact width', minuteSpanToWidth(9 * 60, 10 * 60, 96), 192);
}

// ------------------------------------------------------------------
console.log('\n' + results.join('\n'));
console.log('\n' + '='.repeat(78));
console.log(`TOTAL: ${pass} passed, ${fail} failed`);
console.log('='.repeat(78));
process.exit(fail === 0 ? 0 : 1);

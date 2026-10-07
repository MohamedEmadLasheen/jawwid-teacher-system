/**
 * THE LESSON DURATION CONTRACT.
 *
 * Duration used to be a fixed dropdown of 30/60/90/120 in four components.
 * The academy's lessons are 40, 45 and 50 minutes as often as they are 60, and
 * the database never imposed the restriction — `duration_minutes SMALLINT
 * CHECK (> 0)` has accepted any positive integer since migration 008. These
 * assert the validation that replaced the dropdown, and — just as importantly
 * — that the arithmetic downstream of it was already duration-agnostic.
 *
 * Runs on plain Node against the esbuild-bundled source, like every other
 * suite here.
 */
import {
  validateLessonDuration, isValidLessonDuration, maxDurationMinutes,
} from './lessonDuration.mjs';
import { minuteToX, minuteSpanToWidth } from './timelineGeometry.mjs';
import { GRID_END_MINUTE, SLOT_MINUTES } from './schedulingConstants.mjs';

let pass = 0, fail = 0;
const results = [];
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}` +
    (ok ? '' : `\n        got:  ${JSON.stringify(got)}\n        want: ${JSON.stringify(want)}`));
}
const line = (t) => { console.log('='.repeat(78)); console.log(t); console.log('='.repeat(78)); };

const ok = (raw, start) => validateLessonDuration(raw, start);

// ====================================================================== A
line('A · THE VALUES THE DROPDOWN COULD NOT EXPRESS');

// The whole point of the change.
for (const m of [40, 45, 50, 75, 100]) {
  check(`${m} minutes is accepted`, ok(String(m)), { ok: true, minutes: m });
}
// And the four it could.
for (const m of [30, 60, 90, 120]) {
  check(`${m} minutes still accepted (old dropdown value)`, ok(String(m)), { ok: true, minutes: m });
}
check('1 minute — the floor the DB CHECK sets', ok('1'), { ok: true, minutes: 1 });

// NOT rounded, NOT snapped to the 30-minute grid, NOT mapped to an option.
check('45 is returned as 45, never rounded to 30 or 60', ok('45').minutes, 45);
check('40 is returned as 40, never rounded to 30', ok('40').minutes, 40);
check('50 is returned as 50, never rounded to 60', ok('50').minutes, 50);
check('no value is snapped to a multiple of SLOT_MINUTES',
  [40, 45, 50, 75].map((m) => ok(String(m)).minutes % SLOT_MINUTES !== 0), [true, true, true, true]);

check('surrounding whitespace is tolerated, the value is not changed',
  ok('  45  '), { ok: true, minutes: 45 });

// ====================================================================== B
line('B · VALIDATION');

check('empty is rejected', ok(''), { ok: false, error: 'required' });
check('whitespace-only is rejected', ok('   '), { ok: false, error: 'required' });
check('zero is rejected', ok('0'), { ok: false, error: 'not_positive' });
check('negative is rejected', ok('-30'), { ok: false, error: 'not_positive' });
check('a decimal is rejected, NOT truncated', ok('45.5'), { ok: false, error: 'not_integer' });
check('a .0 decimal is still a whole number', ok('45.0'), { ok: true, minutes: 45 });
check('letters are rejected', ok('abc'), { ok: false, error: 'not_a_number' });
check('a number with a suffix is rejected', ok('45min'), { ok: false, error: 'not_a_number' });

// Number() is generous in ways a duration field must not be.
check('hex is rejected rather than read as 30', ok('0x1E'), { ok: false, error: 'not_a_number' });
check('exponent notation is rejected', ok('1e3'), { ok: false, error: 'not_a_number' });
check('Infinity is rejected', ok('Infinity'), { ok: false, error: 'not_a_number' });
check('a bare minus is rejected', ok('-'), { ok: false, error: 'not_a_number' });
check('a comma decimal is rejected', ok('45,5'), { ok: false, error: 'not_a_number' });

check('isValidLessonDuration agrees with validate',
  ['45', '0', '', 'abc', '60'].map((r) => isValidLessonDuration(r)),
  [true, false, false, false, true]);

// ====================================================================== C
line('C · THE PAST-MIDNIGHT BOUND (the system\'s own, not a new one)');

// Mirrors the DB's CHECK (start_minute + duration_minutes <= 1440) and the
// picker's `outside_timeline` rule. No invented business limit.
const at = (h, m = 0) => h * 60 + m;

check('60 minutes at 23:00 exactly reaches midnight — allowed',
  ok('60', at(23)), { ok: true, minutes: 60 });
check('61 minutes at 23:00 would pass midnight — rejected',
  ok('61', at(23)), { ok: false, error: 'past_midnight' });
check('30 minutes at 23:30 exactly reaches midnight — allowed',
  ok('30', at(23, 30)), { ok: true, minutes: 30 });
check('45 minutes at 23:30 is rejected',
  ok('45', at(23, 30)), { ok: false, error: 'past_midnight' });
check('45 minutes at 16:00 is fine', ok('45', at(16)), { ok: true, minutes: 45 });

check('the bound is derived from the start, not fixed',
  [at(8), at(16), at(23), at(23, 30)].map(maxDurationMinutes),
  [GRID_END_MINUTE - at(8), GRID_END_MINUTE - at(16), 60, 30]);

check('with no start time the bound is simply not applied',
  ok('600'), { ok: true, minutes: 600 });

// Ordering: a value that is both invalid AND too long reports the value fault.
check('zero at a late start reports not_positive, not past_midnight',
  ok('0', at(23, 30)), { ok: false, error: 'not_positive' });

// ====================================================================== D
line('D · THE SCHEDULE USES THE EXACT DURATION');

/**
 * These are the examples from the requirement, computed the way the app does:
 * the end minute is start + duration, with no rounding anywhere.
 */
const end = (startMinute, duration) => startMinute + duration;
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

check('4:00 PM + 45 = 4:45 PM', hhmm(end(at(16), 45)), '16:45');
check('3:30 PM + 40 = 4:10 PM', hhmm(end(at(15, 30), 40)), '16:10');
check('4:00 PM + 40 = 4:40 PM', hhmm(end(at(16), 40)), '16:40');
check('4:00 PM + 50 = 4:50 PM', hhmm(end(at(16), 50)), '16:50');
check('4:00 PM + 30 = 4:30 PM (unchanged)', hhmm(end(at(16), 30)), '16:30');

// Geometry: width is strictly proportional to the duration, for ANY integer.
{
  const cw = 96;
  for (const d of [30, 40, 45, 50, 60, 75, 90, 120]) {
    check(`${d}-min width is exactly ${d}/${SLOT_MINUTES} of a column`,
      minuteSpanToWidth(at(16), at(16) + d, cw), (d * cw) / SLOT_MINUTES);
  }
  // A 45-minute lesson is wider than a 40 and narrower than a 50 — the
  // ordering a snapped implementation would destroy.
  const w = (d) => minuteSpanToWidth(at(16), at(16) + d, cw);
  check('widths are strictly increasing with duration',
    w(40) < w(45) && w(45) < w(50), true);
  check('a 45-min lesson is NOT the same width as a 60-min one', w(45) === w(60), false);
  check('its right edge lands on the exact end minute',
    minuteToX(at(16), cw) + w(45), minuteToX(at(16, 45), cw));
}

// ====================================================================== E
line('E · REGRESSION — THE OLD FOUR STILL BEHAVE');

for (const d of [30, 60, 90, 120]) {
  check(`${d} min: accepted, exact, and positioned proportionally`,
    [ok(String(d)).minutes, minuteSpanToWidth(at(16), at(16) + d, 96)],
    [d, (d * 96) / SLOT_MINUTES]);
}
check('an existing lesson\'s stored value round-trips through the field',
  [30, 45, 60, 90, 120].map((d) => ok(String(d)).minutes), [30, 45, 60, 90, 120]);

console.log(results.join('\n'));
console.log('-'.repeat(78));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

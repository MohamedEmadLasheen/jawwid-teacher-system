# Schedule Layout Tests (RTL + LTR)

Rendered-layout regression tests for the schedule timeline, run in a real
browser against the **real components** and the project's **real Tailwind
build**.

```bash
npx playwright test --config tests/schedule-layout/playwright.config.ts
```

(First run only: `npx playwright install chromium`.)

The harness server binds port 5310. Set `SCHEDULE_TEST_PORT` to run from a
second checkout (a git worktree, a CI shard) at the same time — otherwise the
second run reuses the first one's server and silently tests the **other**
checkout's source:

```bash
SCHEDULE_TEST_PORT=5317 npx playwright test --config tests/schedule-layout/playwright.config.ts
```

## Why these exist

The pure geometry suites in `scripts/schedule-geometry-tests/` could not catch
a real regression that shipped to review. `minuteToX` was correct in both
directions, but its value was applied as a **physical `left`**. The time axis
is a flex row, so under `dir="rtl"` — which this app ships, and which Arabic
selects — the header reversed while the absolutely-positioned lesson cards and
availability bands did not. Everything mirrored away from the header:

| Column width | RTL lesson drift (before fix) |
|---|---|
| 40 px | 160 px |
| 61 px | 244 px |
| 96 px | 384 px |

The defect lived in the CSS layout interaction, not in the arithmetic, so no
pure-function assertion could have detected it. These tests measure the actual
rendered boxes instead.

## What they assert

Everything is measured on the **inline-start** edge — the left edge in LTR, the
right edge in RTL. That is the direction-independent way to ask "is this
element where the header says this minute is?", and it is why a single set of
assertions covers both directions.

| Group | Coverage |
|---|---|
| Alignment | Lesson, availability band and header agree, in **both directions** |
| Column widths | 40 px, 61 px, 96 px — the fix is not tied to one scale |
| Time positions | Window start (14:00), interior (15:30), fractional (16:00+40m), end boundary (19:00) |
| Durations | 30-minute = exactly one column; 40-minute = exactly 40/30 of a column, never two |
| Current-time marker | Sits on the same axis as the header (skipped outside 07:00–24:00) |
| Scrolling | Alignment holds at six scroll positions including both extremes and a return |
| Frozen column | The day/teacher column does not move while the timeline scrolls |
| Equivalence | Every inline-axis coordinate is identical between RTL and LTR |

## Guarding against vacuous tests

These assertions were validated by removing the fix and re-running: **5 LTR
tests passed and all 5 RTL tests failed, plus the cross-direction equivalence
test** — 6 failed, 5 passed. The suite fails on the bug and passes on the fix,
so it is not vacuously green.

## Legend filters (`legend-filters.spec.ts`)

The filter semantics are proved as pure functions in
`scripts/schedule-geometry-tests/filters.test.mjs`. This spec covers what
only exists once the components render, in **both directions** and at 375px:

| Group | Coverage |
|---|---|
| Semantics as controls | Every legend item is a `<button>` with `aria-pressed`, never a styled span |
| Data-driven labels | The shift chips still derive name, window and headcount from the roster |
| It actually filters | Clicking Full-time changes the rendered rows; clicking again restores them |
| OR within a category | Full-time + Part-time; two supervisors; Trial + Active |
| AND across categories | Full-time + Dina + Trial, including the zero-match case |
| Free time | Only teachers with real unsold capacity survive, their lessons stay drawn, and no free band overlaps a lesson card |
| Outside shift | Only teachers booked outside their own window, showing only those lessons |
| One source of truth | The bar's switches drive the chips and the chips drive the bar's status select |
| Search | Combines with a legend filter as AND, not OR |
| Keyboard & focus | Tab-focusable, visible focus ring, Space and Enter both toggle |
| No layout shift | Every chip's box is byte-identical before and after three toggles |
| Zero results | A message plus a working "Clear filters" button |
| Mobile | Chips wrap, stay ≥24px tall, never overflow the viewport, and filter on tap |

The layout-shift assertion is not decorative: it caught a real regression in
the first implementation, where the selected state added `font-medium` and
the wider label reflowed the wrapped legend.

## Fixtures only

The harness seeds React Query directly and aliases `@/lib/supabase` to a stub
that resolves every query to an empty result. No test here can reach the
database or depend on production lesson records.

# Schedule Timeline Geometry & Acceptance Tests

Executable assertions for the schedule's canonical time→pixel coordinate
system, its free-capacity computation, and the scheduling system's
acceptance criteria.

```bash
./scripts/schedule-geometry-tests/run.sh
```

Two suites run in sequence:

| File | Asserts |
|---|---|
| `timeline.test.mjs` | Coordinate system and free-capacity algebra (47) |
| `acceptance.test.mjs` | System acceptance criteria (72) |

**Every lesson in both suites is a fixture defined in the test file.** The
suites deliberately do not read production lesson data: the legacy lesson
records are invalid and scheduled for deletion, so they must not inform the
design or the acceptance of this system. Teacher availability is the only
input the free-capacity behaviour depends on.

No test-runner dependency is added to the project. The runner uses the
`esbuild` binary Vite already installs to bundle the two **pure** modules
under test to ESM, then runs the assertions on plain Node:

- `src/features/scheduling/utils/timelineGeometry.ts`
- `src/features/scheduling/utils/computeRowLayout.ts`

## What is covered

**Header ↔ lesson alignment (Requirement 3, checks F/G/H)**

- All 34 thirty-minute boundaries land at *exactly* `columnIndex *
  columnWidth` — the same offset the time header's fixed-width cells
  produce — at column widths 40/48/61/96/120px. Drift is asserted to be
  `0`, not "small".
- A 30-minute lesson is exactly one column wide; a 40-minute lesson is
  exactly `40/30` of a column and is **not** rounded up to two columns.
- A 15:30 lesson's left edge equals the 15:30 column edge; a 16:00+40min
  lesson's right edge equals x(16:40).
- Off-grid starts (the legacy spreadsheet import produces `:40` starts)
  are positioned exactly rather than snapped to the containing column.

**Free capacity (Requirement 2, checks D/E)**

The spec's TEST 1–4 verbatim, plus: a fully-booked shift yields no free
capacity, a lesson overrunning the shift end clips correctly, split
availability windows are handled, and time outside the working window is
never reported as free.

**Scoping (Requirement 1, check C)**

A teacher with no availability rows yields an empty working window, no
free bands, and no column marked in-window — i.e. the whole shift-aware
behaviour is inert for teachers outside the configured groups, so their
rows render exactly as they did before.

## Acceptance suite

- **Working windows** load from the `v_teacher_availability_unified` row
  shape (14:00–19:00 full shift, 14:00–18:00 part-time).
- **Empty schedule** — the post-deletion state — shows the entire working
  window as one contiguous free band, with the correct in-window column
  count, and nothing free outside it.
- **Booking a lesson** removes *exactly* its duration from free capacity:
  asserted incrementally over a 30-, 40- and 60-minute booking, checking
  both the resulting bands and the minute-for-minute delta. Removing the
  lessons again restores the full window.
- **30- and 40-minute lessons** are positioned and sized correctly at
  several column widths; a 40-minute lesson is never rounded to two
  30-minute columns.
- **Out-of-window lessons** stay positioned and visible but add no
  capacity; a lesson straddling the shift start has only its in-window
  portion subtracted.
- **One coordinate system** — header boundaries, lesson edges and
  availability band edges all resolve to the same pixel offsets, with
  drift asserted to be exactly `0`.
- **Unscoped teachers** are unaffected in every respect.

Browser-level behaviour (the frozen day column during horizontal
scrolling, header/lesson drift under live scroll, and master-grid
virtualization) is verified by DOM measurement rather than here, since it
depends on layout rather than pure functions.

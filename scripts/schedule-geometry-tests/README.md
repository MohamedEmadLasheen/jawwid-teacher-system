# Schedule Timeline Geometry & Acceptance Tests

Executable assertions for the schedule's canonical time→pixel coordinate
system, its free-capacity computation, and the scheduling system's
acceptance criteria.

```bash
./scripts/schedule-geometry-tests/run.sh
```

The suites run in sequence:

| File | Asserts |
|---|---|
| `timeline.test.mjs` | Coordinate system and free-capacity algebra |
| `acceptance.test.mjs` | System acceptance criteria |
| `roster.test.mjs` | Roster membership and working windows |
| `viewport.test.mjs` | Visible-timeline bounds |
| `quickactions.test.mjs` | Mobile quick-action rules |
| `sametimeslot.test.mjs` | Slot membership and bulk-edit preflight |
| `filters.test.mjs` | Schedule filter semantics (97) |

**Every lesson in both suites is a fixture defined in the test file.** The
suites deliberately do not read production lesson data: the legacy lesson
records are invalid and scheduled for deletion, so they must not inform the
design or the acceptance of this system. Teacher availability is the only
input the free-capacity behaviour depends on.

No test-runner dependency is added to the project. The runner uses the
`esbuild` binary Vite already installs to bundle the **pure** modules under
test to ESM, then runs the assertions on plain Node — among them:

- `src/features/scheduling/utils/timelineGeometry.ts`
- `src/features/scheduling/utils/computeRowLayout.ts`
- `src/features/scheduling/utils/deriveScheduleRows.ts`

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

## Filter suite

`filters.test.mjs` covers `deriveScheduleRows` — the whole pipeline from
roster + lessons + availability + filter state to the visible rows.

**The semantics it pins down**

- **AND across categories, OR within one.** The worked example (Full-time +
  Dina + Trial) is asserted directly, as is the trap it guards: three
  selections must not collapse into a union.
- **Shift groups are filtered by shift-template id**, the same identity
  `buildScheduleRoster` groups by — not by `teacherType`, which cannot
  separate one shift group from another because every roster teacher is
  `shift` (asserted).
- **Free time is real unsold capacity.** Rows survive only when
  `availability − all of today's lessons` is non-empty, so a solidly booked
  teacher and a teacher with no configured window both drop out.
- **Filtering never invents capacity.** A row carries its unfiltered
  `occupancy` alongside its filtered `lessons`, so hiding a lesson (by
  status, supervisor, …) cannot repaint its minutes as free.
- **Outside shift comes from the teacher's own window**, never the viewport:
  widening one teacher's availability removes them from the result.
- **Occurrence exceptions feed the filters** — a cancellation frees capacity,
  a reschedule can move a lesson in or out of the shift, and nothing in the
  source arrays is mutated.

### Guarding against vacuous tests

Validated by restoring the previous implementation — occupancy taken from the
*filtered* lessons, no row-level free-capacity predicate, and the shipped
`if (filters.availableOnly) { teacherLessons = []; }` — and re-running:
**20 assertions failed, 77 passed.** The suite fails on the old behaviour and
passes on the new one.

## Student → responsible Admin suite

`studentadmin.test.mjs` covers the ownership relationship and the colour
derived from it, against `responsibleAdmins.ts`, `studentValidation.ts`,
`lessonColor.ts`, `deriveScheduleRows.ts` and `students.mapper.ts`.

**The rules it pins down**

- **The Admin is the single source of truth for the colour.** Reassigning a
  student from Dina to Asmaa turns their lesson from red to green with
  `supervisorId` as the only field that differs, and recolouring the *Admin*
  recolours the student with no student write at all.
- **No colour is ever stored on a student.** The insert payload and the update
  patch are asserted field by field; any colour-shaped key in either fails.
- **A new student cannot be unowned**, and both missing fields are reported at
  once rather than one submit at a time.
- **A legacy unowned student is tolerated, not guessed at.** It yields no
  colour (never a borrowed one), it matches no Admin filter, and editing it
  requires choosing an Admin — which is how the backlog clears.
- **A group lesson** takes the first-added participant's Admin, and skips an
  unowned participant rather than losing its colour.
- **The existing supervisor filter is unchanged**: OR within the category, and
  a reassignment moves the lesson between Admins' filters.
- **The indexed lookup is sound.** `lessonColor` memoises its id→record maps on
  array identity to avoid an N+1 across hundreds of lesson cards; a refetched
  array must be re-indexed rather than served stale, which is asserted.

Rendered behaviour — that the selector is a real combobox with the four
colour dots, that it blocks submit, and that the grid repaints — is verified
in `tests/schedule-layout/student-admin.spec.ts`.

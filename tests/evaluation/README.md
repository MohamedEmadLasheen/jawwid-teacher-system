# Teacher Evaluation Browser Tests

The teacher-evaluation feature driven through the **real** Action Center page in
a real browser, in both text directions.

```bash
npx playwright test --config tests/evaluation/playwright.config.ts
```

```bash
EVALUATION_TEST_PORT=5321 npx playwright test --config tests/evaluation/playwright.config.ts
```

Set `EVALUATION_TEST_PORT` to run a second checkout (a git worktree, a CI
shard) concurrently. Without it, `reuseExistingServer` will happily attach to
whatever already holds port 5320 — including another worktree's harness serving
different source, which silently tests the wrong code.

## What is real and what is not

| | |
|---|---|
| Action Center page | real |
| Evaluation dialog and form | real |
| Searchable teacher selector | real |
| Store action → service → mapper | real |
| Tailwind build, i18n, RTL | real (the harness is rooted at the repository, so `postcss.config.js` and `tailwind.config.ts` apply) |
| Teachers and existing evaluations | fixtures, seeded into the stores |
| Supabase | `supabase-stub.ts` |

Only the database is replaced. A save therefore travels the production path and
is echoed back the way Postgres would return it — payload plus a generated id,
with the migration-001 column defaults filled in for the 16 legacy criterion
columns the service deliberately does not write. The service's own mapper, and
so the real `parseCriteria`, runs on the way back out: a test that reads a
comment off the rendered list has proved the whole round trip, not the form's
local state.

Every insert is recorded on `window.__evalStub.inserts`, which is how the
tests assert **what** was sent — that each criterion's comment is inside that
criterion, and that the general comment went to `custom_note` and nowhere near
one.

## Fixtures

Four evaluations, chosen to cover the compatibility boundary:

| Fixture | Why |
|---|---|
| `ev-nine` | A 9-criteria evaluation with per-criterion comments and a general comment |
| `ev-historical` | `criteria: null`, no general comment — must still render, keep its original 83/Good, and grow no invented comment |
| `ev-historical-note` | `criteria: null` but *with* a `custom_note`, because that column has existed since migration 001 and some old rows already carry one |
| `ev-all-nine` | A distinct score AND a distinct comment on every one of the nine — the fixture that proves nine comments land on nine criteria and none bleeds into another |

The roster mixes Arabic and English names and deliberately includes two
teachers sharing a given name, two sharing a surname, the trailing spaces the
real data carries, and a hamza-alef spelling — so partial search has something
real to disambiguate and the Arabic folding rule is exercised, not assumed.

## Covered

- **Teacher selection** — searchable; full, partial, mid-token, surname-only and
  case-insensitive search; Arabic given-name and second-name search; Arabic
  orthography folding; the empty state; one teacher only; and saving without a
  teacher failing validation *and writing nothing* (submitted past the disabled
  button, to prove the guard is in the handler).
- **The nine criteria** — all nine render with the existing 4-level scale and
  their own comment field; scores persist; a template sets scores without
  inventing or erasing comments.
- **Per-criterion comments** — nine distinct comments at once, each stored on
  its own criterion; commenting one leaves the rest empty; all optional.
- **The general comment** — a separate field; saved to the whole-evaluation
  field and never into a criterion; appears under the teacher's name
  immediately on save, without a reload; smaller than the name and line-clamped
  so it informs the row without dominating it.
- **Backward compatibility** — historical evaluations render with their original
  scores, gain no fabricated comment, and mix with new ones in the same list
  with no page error.
- **Arabic / RTL** — the selector and its popover in RTL, Arabic criterion
  labels, an Arabic comment rendering inside its row, and no horizontal
  overflow introduced anywhere on the page.
- **Read-back** (`readback.spec.ts`) — the collapsible Evaluation Details
  section: all nine scores and nine comments render under the right criterion;
  an uncommented criterion renders no element rather than an empty box; the
  section is collapsed by default, expands and collapses, contains no control
  that could change anything, and writes nothing; a historical evaluation
  (`criteria === null`) is given no control at all and no fabricated ratings;
  and all of it holds in Arabic/RTL at both desktop and 375px.

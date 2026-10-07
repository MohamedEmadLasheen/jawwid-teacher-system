# Teacher Evaluation Tests

Executable assertions for the nine evaluation criteria, the per-criterion
comments, the general comment, and the backward compatibility of evaluations
created before any of them existed.

```bash
./scripts/evaluation-tests/run.sh
```

| File | Asserts |
|---|---|
| `criteria.test.mjs` | The nine criteria, the scoring arithmetic, the JSONB round trip, historical rows, write-side validation, and teacher search (86) |
| `form.test.mjs` | Static policy over the real `.tsx` sources: the selector is searchable, comments go through one code path, the write boundary refuses a half-formed evaluation, labels exist in both languages, the general comment is displayed under the teacher's name, and the read-back view is read-only (53) |

No test-runner dependency is added. `run.sh` uses the `esbuild` binary Vite
already installs to bundle the **pure** modules under test to ESM, then runs
the assertions on plain Node — the same mechanism as
`scripts/schedule-geometry-tests/run.sh`:

- `src/lib/evaluationCriteria.ts`
- `src/lib/searchText.ts`

## What is covered

**The nine criteria.** Count, order, and the fact that this feature invented no
new scoring scale — `RATING_OPTIONS` and `RATING_SCORE` are asserted to be the
pre-existing 4-level ordinal scale, and `gradeForScore` the pre-existing
90/75/60/45 thresholds. The score formula is pinned at its boundaries (all
excellent, all needs-improvement, each behavioural bonus), so a change to any
of them fails here rather than silently re-grading every teacher.

**A comment belongs to ONE criterion.** The defect this structure exists to
prevent is one criterion's comment landing on another, so it is asserted
directly: nine distinct comments survive a storage round trip on their own
criteria; setting a score does not erase a comment; writing a comment does not
disturb a score; a template never writes or erases one.

**Backward compatibility.** `parseCriteria` is asserted to return `null` — not
nine invented "Good" ratings — for the `'{}'` column of a pre-feature row, and
to tolerate every malformed shape a row written by another build could carry
(missing keys, unknown keys, unrecognised scores, non-string comments, a
non-object column) without throwing.

**Teacher search** runs against the shared `matchesSearch` the selector
actually uses, over a roster of real Arabic and English spellings: `محمد` and
`حسين` must both find `محمد حسين`, and a bare alef must find a hamza-alef.

**`form.test.mjs` is a static check over the repository**, in the spirit of
`scripts/schedule-geometry-tests/selectors.test.mjs`. It fails if a plain
`<Select>` over a teacher collection reappears in the evaluation form — an
unsearchable list of every teacher in the academy is the exact defect this
feature removed, and reintroducing it must break a suite rather than ship.

## The browser suite

Layout, RTL and the full save path are covered separately, in a real browser:

```bash
npx playwright test --config tests/evaluation/playwright.config.ts
```

See `tests/evaluation/README.md`.

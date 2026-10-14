# Grid schedule import

Imports the operations schedule workbook (one sheet per weekday, teachers in
column A, 30-minute columns, student names in the cells) into the Teacher
System's `lessons` / `lesson_participants`. It is built to be re-run on every
new version of the workbook: it never edits, moves, ends or deletes an
existing lesson, never creates a teacher or a student, and writes only lessons
whose every identity and field is verified.

Jawwid Core is not read or written by this tool.

## Components

| File | Responsibility |
|---|---|
| `workbook.py` | Parse and validate the workbook; reconstruct each column's time; flag every cell that cannot be read unambiguously |
| `teacher_identity_map.json` | **The only place teacher identities are decided.** Sheet spelling(s) → teacher id, with the basis and evidence; plus the 14-teacher shift roster baseline |
| `student_identity_decisions.json` | **Owner-approved student decisions.** "Under teacher T, the name as written N is student S" — keyed by teacher and name, never by cell. Only entries with `approved_by` are used; each is re-checked against the database |
| `proposals.py` | Record-level proposals that need authorization (hourly roster membership, student resolutions, new student records), with an in-memory simulation of what approving each would add |
| `fullreport.py` | Source → database → interface reconciliation (every teacher, every student-name occurrence, all lesson cells; visibility under the deployed code and under PR #29) |
| `identity.py` | Load and re-validate the map; resolve students conservatively; compute lesson-history evidence |
| `reconcile.py` | One outcome per source cell; overlap, reschedule and duplicate detection |
| `sqlgen.py` | The single INSERT-only, atomic import block |
| `db.py` | Read-only snapshots; the production (`supabase --linked`) and `psql` targets |
| `verify.py` | Post-import proof against the persisted database |
| `report.py` | Reconciliation workbook, summary and teacher classification report |
| `../grid_import.py` | CLI: `plan`, `apply`, `verify`, `propose` |

## Outcomes

Every source lesson cell gets exactly one:

| Status | Meaning |
|---|---|
| `ALREADY_PRESENT` | An active/trial lesson with the same teacher, day, start minute, duration and participants exists (or this cell was imported earlier from the same workbook). Nothing is written. |
| `IMPORT` | All identities confirmed, every field unambiguous, no overlap. Written with exactly the source values. |
| `PENDING` | Not written. Every blocking reason is listed with the decision that resolves it (see `DECISIONS` in `reconcile.py`): unresolved/unmapped teacher, missing/ambiguous/uncertain student, a note in the cell, a time annotation that differs from the column, a header after midnight or a header gap, an existing lesson that differs or may have been rescheduled, a student already booked elsewhere, or two workbook cells that overlap. |
| `REJECTED` | Reserved for a cell that can never be a lesson as written. |

Blank and whitespace-only cells (including empty merged blocks) are reported
as non-lesson cells and are not counted.

Every PENDING cell also carries `root_causes` (teacher identity, student record
missing, student identity, source data, unsupported time, conflict) and
`db_presence`: whether the database already holds the same students at that day
and start on another teacher or with another duration (reported, never acted
on).

## Rules the tool enforces

* **Times are never changed.** A column's time comes from its header; the
  AM/PM half is reconstructed from column order and the workbook is rejected
  if any header is not 1–180 minutes after the previous one. A cell whose text
  carries a different time/duration (`"… 3:20"`, `"45 …"`, `"… 10 د"`) is held
  with both values in the report. A header at or after 24:00 (the sheet's
  "12:00" after 11:30 PM) is held: the data model stores a day plus a minute
  0–1439 and the calendar day of such a lesson needs a decision.
* **Teachers** resolve only through `teacher_identity_map.json`. Each
  CONFIRMED entry is re-validated on every run (record exists, not deleted,
  basis evidence still holds, roster unchanged); a failing entry is treated as
  UNRESOLVED. Classification follows the owner rule of 2026-10-13: the 14
  roster teachers are shift-based/part-time, every other confirmed teacher is
  hourly. The plan refuses to proceed if the live roster differs from the
  baseline in the map.
* **Students** resolve only to an existing, well-formed record (names carrying
  digits, brackets, `*`, `/`, `&` or several people are not identities), by:
  exact unique spelling; or the one record of several that *this teacher* has
  taught; or the sole orthographic variant (ة/ه, ى/ي …) this teacher has
  taught. A bare first name with no history with the teacher is uncertain.
  Lessons written by this importer are never used as evidence, so planning is
  a fixed point: re-planning after an import yields no new writes.
* **Existing appointments** are matched by content, never by cell coordinate
  (the 2026-10-06 import's `source_cell` values refer to an older layout).

## Proposals (never written by the tool)

```bash
python3 scripts/import-schedule/grid_import.py propose --target linked --workdir <linked-dir> \
  --workbook "<Schedule Sheet.xlsx>" --out scripts/import-schedule/dry-run/<run>   # after `plan` into the same <run>
```

writes `<run>/proposals/`: `proposals.json`, `hourly-roster.sql` and
`full-reconciliation.xlsx`.

* **Hourly roster** — every confirmed hourly teacher, recorded in
  `schedule_hourly_roster` (migration 026) so they appear in the Hourly group
  before any lesson is booked. Membership only: no hours. `hourly-roster.sql`
  is INSERT-only and refuses a deleted teacher, a shift-roster teacher, or a
  database without migration 026.
* **Student resolutions** — `NAME_AND_RESPONSIBLE_ADMIN` (one same-named
  record also has the responsible Admin the cell colour denotes) and
  `SOLE_RECORD_NEEDS_CONFIRMATION` (a bare first name with exactly one record).
  Approve by copying entries, with `approved_by`, into
  `student_identity_decisions.json`, then re-plan.
* **New students** — names with no record, from cells with an unambiguous
  reading (a word "وX" is read as "and X" only when the recorded names say so)
  and no note or time annotation; responsible Admin from the cell colour.
  Creating them is a separate, authorized write.

## Provenance and idempotency

Each imported lesson carries `source_sheet = <sheet>` and
`source_cell = <cell>@<first 12 hex of the workbook's SHA-256>`. The deployed
unique index `lessons_source_provenance_uniq` and the immutability trigger
(both recorded in migration 025) make a second insert of the same source cell
impossible and the provenance unchangeable. The import block additionally
refuses to run if any planned key exists, if the booked schedule's fingerprint
changed since the plan was reviewed, or if a teacher/student was deleted.

## Running it

Prerequisites: Python 3.10+, `openpyxl`; the Supabase CLI logged in, and a
working directory linked to the Teacher System project
(`supabase link --project-ref wjpnkvagwayzwpwrbqyr --workdir <dir>`). Keep every
plan directory under `scripts/import-schedule/dry-run/` (git-ignored: the
reports contain children's names).

```bash
# 1. Plan (read-only). Prints the plan id and the outcome counts.
python3 scripts/import-schedule/grid_import.py plan --target linked --workdir <linked-dir> \
  --workbook "<Schedule Sheet.xlsx>" --out scripts/import-schedule/dry-run/<run>

# 2. Review <run>/summary.md, teacher-classification.md, reconciliation.xlsx and import.sql.

# 3. Back up and prove the backup restores (see "Backup" below), then apply.
python3 scripts/import-schedule/grid_import.py apply --target linked --workdir <linked-dir> \
  --out scripts/import-schedule/dry-run/<run> --confirm <plan id> --backup <backup dir>

# 4. apply runs verify automatically; it can be re-run at any time.
python3 scripts/import-schedule/grid_import.py verify --target linked --workdir <linked-dir> \
  --out scripts/import-schedule/dry-run/<run>
```

`apply` refuses unless `--confirm` equals the plan id, `import.sql` is
byte-identical to the reviewed one, the plan has no teacher-map problems, and
(for production) the backup's `SHA256SUMS` verify and a `RESTORE.md` records a
tested restore.

## Backup

```bash
supabase db dump --linked --workdir <linked-dir> -s public -f <dir>/public-schema.sql
supabase db dump --linked --workdir <linked-dir> -s public --data-only --use-copy -f <dir>/public-data.sql
```

Restore both into a disposable `public.ecr.aws/supabase/postgres` container
(`create extension btree_gist` first), compare per-table row counts and
content hashes with production, record the result in `<dir>/RESTORE.md`, then
`shasum -a 256 * > SHA256SUMS`. Keep the directory mode 700.

## Release of PR #29 (Hourly group, whole-day timeline, migration 026)

Order — each step is safe on its own, and the code tolerates 026 being absent:

1. Back up and prove the restore (see **Backup**); record per-table content
   hashes of production as the pre-release baseline.
2. `plan` + `propose` against production (read-only); review `hourly-roster.sql`.
3. Apply `supabase/migrations/026_schedule_hourly_roster.sql`, then run
   `026_verify.sql` and check every EXPECT.
4. Apply `<run>/proposals/hourly-roster.sql` (INSERT-only, atomic; refuses a
   deleted or shift-roster teacher; `ON CONFLICT DO NOTHING`, so a re-run adds nothing).
5. Re-hash production: every pre-existing table identical, `schedule_hourly_roster`
   holding exactly the proposed teachers.
6. Merge the PR to `main`; the "Deploy to VPS" workflow builds and flips the
   `current` release symlink. Confirm the run succeeded and the served bundle
   is the new build.

Recovery: the site rolls back instantly by repointing `current` at the previous
release (see `DEPLOY.md`); the code still works with the table present. The
membership rows are removed with `DELETE FROM public.schedule_hourly_roster`
and the table with `026_rollback.sql` — neither touches lessons, teachers,
students or shift assignments.

## Recovery

A batch is identified by its provenance suffix and plan. To withdraw one batch
(only with the owner's explicit approval, and only while none of its lessons
has been edited or reported on):

```sql
BEGIN;
-- inspect first: must equal the plan's lesson count, and every row untouched since import
SELECT count(*), bool_and(updated_at = created_at) FROM public.lessons WHERE source_cell LIKE '%@<sha12>';
DELETE FROM public.lessons WHERE source_cell LIKE '%@<sha12>';   -- participants cascade
COMMIT;
```

`lesson_session_reports` / `lesson_exceptions` rows added after the import
would block or be removed by this; check them first. A full restore from the
backup is the fallback.

## Tests

```bash
# pipeline rules (no database)
python3 -m unittest discover -s scripts/import-schedule -p 'test_pipeline.py' -t scripts/import-schedule

# + the generated SQL against a local Postgres built from migrations 001-020, 024, 025
# (021-023 encode production teacher ids and cannot run on an empty database)
GRID_TEST_PGHOST=127.0.0.1 GRID_TEST_PGPORT=<port> GRID_TEST_PGUSER=postgres GRID_TEST_PGPASSWORD=<pw> \
GRID_TEST_PGDATABASE=postgres python3 -m unittest discover -s scripts/import-schedule -p 'test_*.py' -t scripts/import-schedule
```

The database tests refuse a non-local host and any database holding a teacher
whose name does not start with `TEST `.

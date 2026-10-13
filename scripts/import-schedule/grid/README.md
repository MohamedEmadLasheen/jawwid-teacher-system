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
| `identity.py` | Load and re-validate the map; resolve students conservatively; compute lesson-history evidence |
| `reconcile.py` | One outcome per source cell; overlap, reschedule and duplicate detection |
| `sqlgen.py` | The single INSERT-only, atomic import block |
| `db.py` | Read-only snapshots; the production (`supabase --linked`) and `psql` targets |
| `verify.py` | Post-import proof against the persisted database |
| `report.py` | Reconciliation workbook, summary and teacher classification report |
| `../grid_import.py` | CLI: `plan`, `apply`, `verify` |

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

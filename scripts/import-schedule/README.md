# Legacy Schedule Import (Phase 2.5)

One-off tool that parses Jawwid Academy's real Google-Sheets-style scheduling
workbook and produces a **dry-run report only**. It never writes to the
database — you review the report, then explicitly approve before anyone
runs a follow-up "commit" step (not built yet; this tool is read-only by
design per the approved plan).

## Prerequisites

- Migrations 005-008 must be applied first (Students/Parents/Courses,
  Teacher Availability/Shifts, Supervisor colors, Lessons/conflict model) —
  the report cross-references live `teachers`/`courses`/`supervisors` data,
  and is more useful once the schema exists, though it will still run and
  report "table not found" gracefully if you run it earlier.
- `.env` in the project root with `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY` (already present for local dev).
- Python 3.9+, `pip install openpyxl requests`.

## Usage

```bash
python3 import_schedule.py "/path/to/Schedule Sheet-1 (1).xlsx"
```

Writes `import_report.md` in the current directory. Nothing else. No
database writes happen at any point.

## What it does

1. Parses all 7 day-sheets (one per Arabic weekday name).
2. Reconstructs each column's actual time-of-day. The header row shows
   12-hour times with no AM/PM marker and wraps twice per day (once at
   noon, once at midnight) — reconstructed by tracking monotonic wraps,
   not by trusting column position alone, so occasional blank/irregular
   header columns don't throw off the rest of the row.
3. For each booked cell: splits multi-student group bookings (separators
   "و" / "&"), strips returning-student asterisks (flagging
   `is_returning`), extracts the numeric minute-override prefix (e.g. "40
   محمد مصعب" → starts at :40 past that column's hour, not the column's own
   :00/:30), reads merged-cell span for duration, and maps fill color to
   one of the 4 known Operations Supervisors (with light/dark shade
   variants folded into the same 4 families).
4. Fetches live `teachers`/`courses`/`supervisors` from Supabase (read-only)
   and attempts to fuzzy-match each sheet teacher name (Arabic) against the
   live roster (English transliterations) using a best-effort Arabic→Latin
   transliteration heuristic + string similarity. This is a heuristic, not
   a ground truth — every match is reported with a confidence score for
   your review, nothing is auto-assigned.
5. Writes `import_report.md`: new students to create, teacher matches
   (confident / ambiguous / unmatched), schedule conflicts the import would
   hit, duplicate lessons, validation errors, unimportable cells with
   reasons, and a full summary of every row that would be inserted.

## Known limitations (by design, not oversights)

- Arabic→Latin transliteration is a hand-written heuristic covering common
  Egyptian-dialect romanization patterns (e.g. ج→g as in "جاد"→"Gad"). It
  will miss or mis-rank some real matches — that's exactly why every match
  is confidence-scored for human review, not auto-committed.
- Course assignment always follows your instruction: use the student's own
  `course_id` if one exists, otherwise leave the lesson as "Course Pending"
  — never inferred from teacher specialization, never defaulted.
- A cell's asterisks mark *every* student parsed from that cell as
  returning (the source data doesn't reliably attribute the marker to one
  specific name within a group cell).

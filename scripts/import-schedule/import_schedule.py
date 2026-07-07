#!/usr/bin/env python3
"""Legacy schedule import — dry-run report generator only. See README.md.

Never writes to the database. Reads (a) the xlsx workbook on disk and
(b) live teachers/courses/supervisors/students from Supabase (read-only,
via the anon key already in the project's .env) purely to cross-reference
for the report.
"""
import sys
import os
import re
import json
from collections import defaultdict
from difflib import SequenceMatcher

import openpyxl

try:
    import requests
except ImportError:
    requests = None

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Sheet name (as it appears in the workbook, Arabic, often with trailing
# whitespace) -> day_of_week matching the app's schema (0=Sunday..6=Saturday).
DAY_SHEET_TO_INDEX = {
    'الاحد': 0, 'الأحد': 0,
    'الاثنين': 1,
    'الثلاثاء': 2,
    'الاربعاء': 3, 'الأربعاء': 3,
    'الخميس': 4,
    'الجمعة': 5,
    'سبت': 6, 'السبت': 6,
}

# Confirmed supervisor colors + the light/dark shade variants of the same
# family observed in the real sheet (see conversation history / migration 006).
SUPERVISOR_COLOR_FAMILIES = {
    'Dina': ['E06666', 'F4CCCC'],
    'Zainab': ['F9CB9C'],
    'Rehab': ['C9DAF8', 'CFE2F3', '9FC5E8'],
    'Basant': ['93C47D', '6AA84F', '38761D'],
}

# Best-effort Arabic -> Latin transliteration, biased toward the Egyptian
# dialect conventions visible in the live teacher roster (e.g. ج -> g as in
# "جاد" -> "Gad"). This is a heuristic for fuzzy matching only — every match
# is confidence-scored for human review, never auto-assigned.
TRANSLIT_MAP = {
    'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'a', 'ب': 'b', 'ت': 't', 'ث': 's',
    'ج': 'g', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'z', 'ر': 'r', 'ز': 'z',
    'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a',
    'غ': 'gh', 'ف': 'f', 'ق': 'k', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
    'ه': 'h', 'و': 'w', 'ي': 'y', 'ى': 'a', 'ة': 'a', 'ء': '', 'ئ': 'y',
    'ؤ': 'w', ' ': ' ',
}

MERGE_DEFAULT_SLOT_MINUTES = 30


def transliterate(name: str) -> str:
    return ''.join(TRANSLIT_MAP.get(ch, ch) for ch in name.lower()).strip()


def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()


# ---------------------------------------------------------------------------
# Column time reconstruction — header labels are 12-hour with no AM/PM and
# wrap twice a day (once at noon, once at midnight). We track monotonic
# wraps rather than trusting column position alone, since a handful of
# sheets have irregular/blank header cells.
# ---------------------------------------------------------------------------

def parse_naive_minutes(label) -> "int | None":
    if label is None:
        return None
    s = str(label).strip()
    m = re.match(r'^(\d{1,2}):(\d{2})', s)
    if not m:
        return None
    h, mi = int(m.group(1)) % 12, int(m.group(2))
    return h * 60 + mi


def reconstruct_column_minutes(ws, header_row=1, first_data_col=3):
    """Returns {col_idx: absolute_start_minute} for every column with a
    parseable header, handling the AM/PM wraparound."""
    result = {}
    half_day = 0
    prev_abs = None
    for col in range(first_data_col, ws.max_column + 1):
        naive = parse_naive_minutes(ws.cell(row=header_row, column=col).value)
        if naive is None:
            continue
        candidate = half_day * 720 + naive
        if prev_abs is not None and candidate <= prev_abs - 1:
            half_day += 1
            candidate = half_day * 720 + naive
        result[col] = candidate
        prev_abs = candidate
    return result


# ---------------------------------------------------------------------------
# Cell text parsing
# ---------------------------------------------------------------------------

NUMERIC_PREFIX_RE = re.compile(r'^\s*(\d{1,2})\s+(?=\S)')
# "و" (and) is frequently attached with no space to the following name in
# informal Arabic (e.g. "جود وجوري" = "Joud" + "and-Jouri", not "Joud wjwry")
# — split on whitespace+waw followed directly by a non-space char, not just
# the fully-spaced " و " form, or the loss would silently merge two real
# students into one name.
SPLIT_RE = re.compile(r'\s+و(?=\S)|\s*&\s*')


def parse_cell(raw_text: str):
    """Returns (student_names: list[str], is_returning: bool, minute_override: int|None)."""
    text = raw_text.strip()
    is_returning = '*' in text
    text = text.replace('*', '')

    minute_override = None
    m = NUMERIC_PREFIX_RE.match(text)
    if m and 0 <= int(m.group(1)) < 60:
        minute_override = int(m.group(1))
        text = text[m.end():]

    names = [n.strip() for n in SPLIT_RE.split(text) if n.strip()]
    return names, is_returning, minute_override


def rgb_distance(hex_a: str, hex_b: str) -> int:
    a = tuple(int(hex_a[i:i + 2], 16) for i in (0, 2, 4))
    b = tuple(int(hex_b[i:i + 2], 16) for i in (0, 2, 4))
    return sum(abs(x - y) for x, y in zip(a, b))


def match_color_to_supervisor(fg_hex):
    if not fg_hex or len(fg_hex) < 6:
        return None, None
    hex6 = fg_hex[-6:].upper()
    for name, family in SUPERVISOR_COLOR_FAMILIES.items():
        if hex6 in family:
            return name, 0
    best_name, best_dist = None, 999
    for name, family in SUPERVISOR_COLOR_FAMILIES.items():
        for shade in family:
            d = rgb_distance(hex6, shade)
            if d < best_dist:
                best_dist, best_name = d, name
    if best_dist <= 40:
        return best_name, best_dist
    return None, best_dist


# ---------------------------------------------------------------------------
# Merge span lookup
# ---------------------------------------------------------------------------

def build_merge_index(ws):
    """Returns {(row, col): span_columns} for the top-left cell of every
    merged range, so continuation cells can be skipped (already counted)."""
    index = {}
    for mc in ws.merged_cells.ranges:
        index[(mc.min_row, mc.min_col)] = mc.max_col - mc.min_col + 1
    return index


def is_merge_continuation(ws, row, col):
    for mc in ws.merged_cells.ranges:
        if mc.min_row <= row <= mc.max_row and mc.min_col <= col <= mc.max_col:
            return not (row == mc.min_row and col == mc.min_col)
    return False


# ---------------------------------------------------------------------------
# Sheet parsing -> raw booking records
# ---------------------------------------------------------------------------

def parse_sheet(ws, day_of_week: int, warnings: list):
    minutes_by_col = reconstruct_column_minutes(ws)
    merge_span = build_merge_index(ws)

    last_teacher_row = 0
    for r in range(3, ws.max_row + 1):
        if ws.cell(row=r, column=1).value:
            last_teacher_row = r
    if last_teacher_row == 0:
        warnings.append(f"Sheet day={day_of_week}: no teacher rows found")
        return []

    bookings = []
    for r in range(3, last_teacher_row + 1):
        teacher_name = ws.cell(row=r, column=1).value
        if not teacher_name or not str(teacher_name).strip():
            continue
        teacher_name = str(teacher_name).strip()

        for col, start_minute in minutes_by_col.items():
            cell = ws.cell(row=r, column=col)
            if cell.value is None or not str(cell.value).strip():
                continue
            if is_merge_continuation(ws, r, col):
                continue

            span_cols = merge_span.get((r, col), 1)
            duration_minutes = span_cols * MERGE_DEFAULT_SLOT_MINUTES

            names, is_returning, minute_override = parse_cell(str(cell.value))
            if not names:
                warnings.append(f"day={day_of_week} row={r} col={col}: cell had no parseable student name(s) ('{cell.value}')")
                continue

            final_start = start_minute
            if minute_override is not None:
                final_start = (start_minute // 60) * 60 + minute_override

            fill = cell.fill
            fg_hex = fill.fgColor.rgb if fill and fill.fgColor else None
            supervisor, color_distance = match_color_to_supervisor(fg_hex if isinstance(fg_hex, str) else None)
            if fg_hex and not supervisor:
                warnings.append(f"day={day_of_week} row={r} col={col}: unrecognized fill color {fg_hex}, supervisor left unassigned")

            bookings.append({
                'day_of_week': day_of_week,
                'teacher_name_raw': teacher_name,
                'row': r,
                'col': col,
                'start_minute': final_start,
                'duration_minutes': duration_minutes,
                'student_names': names,
                'is_returning': is_returning,
                'supervisor': supervisor,
                'raw_cell_text': str(cell.value).strip(),
            })
    return bookings


# ---------------------------------------------------------------------------
# Reference data (read-only Supabase REST)
# ---------------------------------------------------------------------------

def load_env(project_root):
    env_path = os.path.join(project_root, '.env')
    env = {}
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#') or '=' not in line:
                    continue
                k, v = line.split('=', 1)
                env[k.strip()] = v.strip()
    return env


def fetch_table(base_url, anon_key, table, select='*'):
    if requests is None:
        return [], 'requests package not installed — run `pip install requests`'
    url = f"{base_url}/rest/v1/{table}?select={select}"
    headers = {'apikey': anon_key, 'Authorization': f'Bearer {anon_key}'}
    try:
        resp = requests.get(url, headers=headers, timeout=15)
    except Exception as e:
        return [], f'request failed: {e}'
    if resp.status_code == 404 or (resp.status_code >= 400 and 'does not exist' in resp.text):
        return [], f'table not found (migration not applied yet?) — {resp.status_code}'
    if resp.status_code >= 400:
        return [], f'HTTP {resp.status_code}: {resp.text[:200]}'
    return resp.json(), None


# ---------------------------------------------------------------------------
# Teacher matching
# ---------------------------------------------------------------------------

def best_teacher_matches(sheet_name, live_teachers, top_n=3):
    translit = transliterate(sheet_name)
    scored = []
    for t in live_teachers:
        full_name = t.get('full_name', '')
        score = similarity(translit, full_name.lower().strip())
        scored.append((t.get('id'), full_name, round(score, 3)))
    scored.sort(key=lambda x: x[2], reverse=True)
    return scored[:top_n]


# ---------------------------------------------------------------------------
# Conflict / duplicate detection (in-memory, over the parsed bookings only)
# ---------------------------------------------------------------------------

def ranges_overlap(a_start, a_dur, b_start, b_dur):
    return a_start < b_start + b_dur and b_start < a_start + a_dur


def find_internal_conflicts(bookings):
    teacher_conflicts = []
    student_conflicts = []
    by_day = defaultdict(list)
    for b in bookings:
        by_day[b['day_of_week']].append(b)

    for day, day_bookings in by_day.items():
        for i in range(len(day_bookings)):
            for j in range(i + 1, len(day_bookings)):
                a, b = day_bookings[i], day_bookings[j]
                if not ranges_overlap(a['start_minute'], a['duration_minutes'], b['start_minute'], b['duration_minutes']):
                    continue
                if a['teacher_name_raw'] == b['teacher_name_raw']:
                    teacher_conflicts.append((a, b))
                shared = set(a['student_names']) & set(b['student_names'])
                if shared and a['teacher_name_raw'] != b['teacher_name_raw']:
                    student_conflicts.append((a, b, shared))
    return teacher_conflicts, student_conflicts


# ---------------------------------------------------------------------------
# Report generation
# ---------------------------------------------------------------------------

def generate_report(bookings, live_teachers, live_courses, live_supervisors, live_students, warnings, teacher_ref_error):
    lines = []
    lines.append('# Legacy Schedule Import — Dry-Run Report')
    lines.append('')
    lines.append('No database writes were made. This is a read-only analysis for your review.')
    lines.append('')

    lines.append(f'## Summary')
    lines.append('')
    lines.append(f'- Total booked cells parsed: {len(bookings)}')
    unique_students = sorted({n for b in bookings for n in b["student_names"]})
    lines.append(f'- Unique student names found: {len(unique_students)}')
    unique_teachers = sorted({b['teacher_name_raw'] for b in bookings})
    lines.append(f'- Unique teacher names found: {len(unique_teachers)}')
    returning_count = sum(1 for b in bookings if b['is_returning'])
    lines.append(f'- Bookings flagged as "returning student": {returning_count}')
    group_count = sum(1 for b in bookings if len(b['student_names']) > 1)
    lines.append(f'- Group lessons (2+ students in one slot): {group_count}')
    lines.append('')

    lines.append('## Teacher matching (Arabic sheet name → live DB teacher)')
    lines.append('')
    if teacher_ref_error:
        lines.append(f'_Could not fetch live teachers: {teacher_ref_error}_')
    else:
        lines.append('| Sheet name | Best match | Confidence | 2nd candidate | 3rd candidate |')
        lines.append('|---|---|---|---|---|')
        for name in unique_teachers:
            matches = best_teacher_matches(name, live_teachers)
            cells = [name]
            for m in matches:
                cells.append(f'{m[1]} ({m[2]})' if m[1] else '—')
            while len(cells) < 4:
                cells.append('—')
            lines.append('| ' + ' | '.join(cells) + ' |')
    lines.append('')
    lines.append('_Confidence is a 0-1 string-similarity score over a best-effort Arabic→Latin'
                  ' transliteration — a heuristic, not ground truth. Review every row above 0.4'
                  ' manually before trusting it; anything lower is effectively unmatched._')
    lines.append('')

    lines.append('## New students to be created')
    lines.append('')
    lines.append(f'{len(unique_students)} unique student names found across all 7 days (deduplicated by exact name match after stripping asterisks/number prefixes).')
    lines.append('')
    for n in unique_students[:200]:
        lines.append(f'- {n}')
    if len(unique_students) > 200:
        lines.append(f'- … and {len(unique_students) - 200} more')
    lines.append('')

    lines.append('## Supervisor assignment')
    lines.append('')
    supervisor_by_student = defaultdict(set)
    for b in bookings:
        if b['supervisor']:
            for n in b['student_names']:
                supervisor_by_student[n].add(b['supervisor'])
    conflicting = {n: s for n, s in supervisor_by_student.items() if len(s) > 1}
    lines.append(f'- Students with a consistent single supervisor color: {len(supervisor_by_student) - len(conflicting)}')
    lines.append(f'- Students with CONFLICTING supervisor colors across the week (flagged, not auto-resolved): {len(conflicting)}')
    for n, s in list(conflicting.items())[:50]:
        lines.append(f'  - {n}: {", ".join(sorted(s))}')
    lines.append('')

    lines.append('## Schedule conflicts the import would hit')
    lines.append('')
    teacher_conflicts, student_conflicts = find_internal_conflicts(bookings)
    lines.append(f'- Teacher double-bookings found in the raw sheet data: {len(teacher_conflicts)}')
    for a, b in teacher_conflicts[:30]:
        lines.append(f'  - {a["teacher_name_raw"]} on day {a["day_of_week"]}: {a["raw_cell_text"]!r} overlaps {b["raw_cell_text"]!r}')
    lines.append('')
    specific_conflicts = [(a, b, s) for a, b, s in student_conflicts if all(len(n.split()) >= 2 for n in s)]
    common_name_conflicts = [(a, b, s) for a, b, s in student_conflicts if any(len(n.split()) < 2 for n in s)]
    lines.append(f'- Student double-bookings (different teachers, overlapping time): {len(student_conflicts)} matched by exact name —'
                 f' split below by name specificity, since single-word first names are frequently shared by different real'
                 f' children (e.g. "حمدان" is a common name, not necessarily one student) and should not be trusted without review.')
    lines.append(f'  - **{len(specific_conflicts)} involve a multi-word name** (lower false-positive risk, worth checking first):')
    for a, b, shared in specific_conflicts[:30]:
        lines.append(f'    - {", ".join(shared)} on day {a["day_of_week"]}: {a["teacher_name_raw"]!r} vs {b["teacher_name_raw"]!r}')
    lines.append(f'  - **{len(common_name_conflicts)} involve a single-word (common first) name** (likely different children who share a name — treat as noise unless individually confirmed):')
    for a, b, shared in common_name_conflicts[:15]:
        lines.append(f'    - {", ".join(shared)} on day {a["day_of_week"]}: {a["teacher_name_raw"]!r} vs {b["teacher_name_raw"]!r}')
    lines.append('')

    lines.append('## Validation warnings / unimportable data')
    lines.append('')
    if not warnings:
        lines.append('None.')
    for w in warnings[:200]:
        lines.append(f'- {w}')
    lines.append('')

    lines.append('## Reference data used')
    lines.append('')
    lines.append(f'- Live teachers fetched: {len(live_teachers)}')
    lines.append(f'- Live courses fetched: {len(live_courses)}')
    lines.append(f'- Live supervisors fetched: {len(live_supervisors)}')
    lines.append(f'- Live students fetched: {len(live_students)}')
    lines.append('')
    lines.append('---')
    lines.append('_Nothing has been written to the database. This report is for review only._')

    return '\n'.join(lines)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    if len(sys.argv) < 2:
        print('Usage: python3 import_schedule.py <path-to-xlsx> [--out import_report.md]')
        sys.exit(1)
    xlsx_path = sys.argv[1]
    out_path = 'import_report.md'
    if '--out' in sys.argv:
        out_path = sys.argv[sys.argv.index('--out') + 1]

    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    env = load_env(project_root)
    base_url = env.get('VITE_SUPABASE_URL')
    # The plain anon key has RLS role 'anon', not 'authenticated' — every
    # table here requires auth.role() = 'authenticated', so anon-key reads
    # come back empty (not an error, just silently zero rows). This script
    # is an internal ops tool run locally, so it also accepts the service
    # role key (bypasses RLS) via a SUPABASE_SERVICE_ROLE_KEY env var —
    # never put that key in the committed .env; export it in your shell
    # only for this one-off run, e.g.:
    #   SUPABASE_SERVICE_ROLE_KEY=... python3 import_schedule.py file.xlsx
    read_key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or env.get('VITE_SUPABASE_ANON_KEY')
    using_anon_only = not os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

    warnings = []
    wb = openpyxl.load_workbook(xlsx_path, data_only=True)

    all_bookings = []
    for sheet_name in wb.sheetnames:
        key = sheet_name.strip()
        day_idx = DAY_SHEET_TO_INDEX.get(key)
        if day_idx is None:
            warnings.append(f"Unrecognized sheet name '{sheet_name}' — skipped")
            continue
        ws = wb[sheet_name]
        all_bookings.extend(parse_sheet(ws, day_idx, warnings))

    teacher_ref_error = None
    live_teachers, live_courses, live_supervisors, live_students = [], [], [], []
    if base_url and read_key:
        live_teachers, err = fetch_table(base_url, read_key, 'teachers', 'id,full_name')
        teacher_ref_error = err
        live_courses, _ = fetch_table(base_url, read_key, 'courses', 'id,name_en,name_ar')
        live_supervisors, _ = fetch_table(base_url, read_key, 'supervisors', 'id,name,color_hex')
        live_students, _ = fetch_table(base_url, read_key, 'students', 'id,full_name')
        if using_anon_only and not live_teachers:
            teacher_ref_error = (teacher_ref_error or '') + (
                ' — likely RLS blocking the anon key (no logged-in session); '
                'set SUPABASE_SERVICE_ROLE_KEY env var to read live data for matching.'
            )
    else:
        teacher_ref_error = '.env missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY'

    report = generate_report(all_bookings, live_teachers, live_courses, live_supervisors, live_students, warnings, teacher_ref_error)
    with open(out_path, 'w') as f:
        f.write(report)

    print(f'Dry-run report written to {out_path} ({len(all_bookings)} bookings parsed, 0 database writes).')


if __name__ == '__main__':
    main()

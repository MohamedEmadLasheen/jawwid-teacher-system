"""Workbook parsing and validation for the operations schedule grid.

The workbook has one sheet per weekday. Row 1 holds 30-minute column headers
written as 12-hour times with no AM/PM marker; column A holds the teacher; a
lesson is a non-blank cell, and a horizontally merged block spans several
columns. This module turns that grid into one record per lesson cell and
NEVER normalises a value away: every record keeps the raw header, the raw
cell text and any reason the cell cannot be read unambiguously.

Header interpretation. Each header is read as 12-hour time; the AM/PM half is
reconstructed from the column SEQUENCE: times must increase left to right, so
a label smaller than its predecessor starts the next 12-hour half (noon, then
midnight). The sheet is rejected if, after that, any column is not 1-180
minutes after the previous one (a repeated or out-of-order label). A header at or after 24:00 belongs to the next
calendar day and is flagged, never folded back.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import re
from dataclasses import dataclass, field, asdict

import openpyxl
from openpyxl.utils import get_column_letter

# Sheet title (stripped) -> lessons.day_of_week (0 = Sunday ... 6 = Saturday).
DAY_BY_SHEET = {
    'الاحد': 0, 'الأحد': 0,
    'الاثنين': 1, 'الإثنين': 1,
    'الثلاثاء': 2,
    'الاربعاء': 3, 'الأربعاء': 3,
    'الخميس': 4,
    'الجمعة': 5,
    'سبت': 6, 'السبت': 6,
}
SLOT_MINUTES = 30
MAX_HEADER_STEP_MINUTES = 180   # the real workbook's largest header gap is 60
FIRST_DATA_ROW = 2
FIRST_TIME_COLUMN = 2          # column B onward may carry a time header
DIGITS = re.compile(r'[0-9٠-٩]')


class WorkbookError(Exception):
    """The workbook cannot be interpreted reliably; nothing may be imported."""


@dataclass
class LessonCell:
    sheet: str                 # stripped sheet title, as stored in lessons.source_sheet
    day_of_week: int
    cell: str                  # anchor cell, e.g. "G3"
    row: int
    col: int
    teacher_raw: str           # column A exactly as written ('' when blank)
    header_raw: str            # the anchor column's header exactly as written
    start_minute: int | None   # reconstructed from the header sequence
    span_columns: int
    duration_minutes: int      # span_columns * 30
    duration_by_headers: int | None  # next header after the block minus start
    merge: str | None
    text_raw: str
    fill: str | None
    flags: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class ParsedWorkbook:
    path: str
    sha256: str
    lessons: list[LessonCell]
    non_lessons: list[dict]
    teacher_rows: list[dict]
    headers: dict[str, list[dict]]   # sheet -> [{col, raw, minute}]

    @property
    def short_sha(self) -> str:
        return self.sha256[:12]


def file_sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 16), b''):
            h.update(chunk)
    return h.hexdigest()


def _header_label(value) -> str:
    if value is None:
        return ''
    if isinstance(value, (dt.time, dt.datetime)):
        return value.strftime('%H:%M')
    return str(value)


def _naive_minutes(value) -> int | None:
    """Minutes within a 12-hour half (00:00-11:59), or None if not a time."""
    if isinstance(value, (dt.time, dt.datetime)):
        return (value.hour % 12) * 60 + value.minute
    if isinstance(value, str):
        m = re.fullmatch(r'\s*(\d{1,2}):(\d{2})\s*', value)
        if m and int(m.group(1)) <= 12 and int(m.group(2)) < 60:
            return (int(m.group(1)) % 12) * 60 + int(m.group(2))
    return None


def reconstruct_header_minutes(header_values: list[tuple[int, object]]) -> list[dict]:
    """[(col, raw)] in column order -> [{col, raw, minute}] for time headers.

    Raises WorkbookError if the sequence is not strictly increasing after the
    12-hour halves are reconstructed — the only evidence for AM/PM is order.
    """
    out, half, prev = [], 0, None
    for col, raw in header_values:
        naive = _naive_minutes(raw)
        if naive is None:
            continue
        minute = half * 720 + naive
        if prev is not None and minute <= prev:
            half += 1
            minute = half * 720 + naive
        # A real 12-hour wrap (11:30 -> "12:00") advances by one slot; a header
        # that only fits by jumping half a day (a repeated or out-of-order
        # label) is not interpretable, so the workbook is rejected.
        if prev is not None and not (0 < minute - prev <= MAX_HEADER_STEP_MINUTES):
            raise WorkbookError(f'header at column {get_column_letter(col)} ({_header_label(raw)}) does not follow the previous column')
        out.append({'col': col, 'raw': _header_label(raw), 'minute': minute})
        prev = minute
    return out


def parse_workbook(path: str) -> ParsedWorkbook:
    wb = openpyxl.load_workbook(path)   # values only; no formulas exist in this workbook
    lessons: list[LessonCell] = []
    non_lessons: list[dict] = []
    teacher_rows: list[dict] = []
    headers: dict[str, list[dict]] = {}

    seen_days = set()
    for ws in wb.worksheets:
        sheet = ws.title.strip()
        if sheet not in DAY_BY_SHEET:
            raise WorkbookError(f'unrecognised sheet {ws.title!r}')
        day = DAY_BY_SHEET[sheet]
        if day in seen_days:
            raise WorkbookError(f'two sheets map to day {day}')
        seen_days.add(day)

        hdr = reconstruct_header_minutes([(c, ws.cell(1, c).value) for c in range(FIRST_TIME_COLUMN, ws.max_column + 1)])
        headers[sheet] = hdr
        minute_by_col = {h['col']: h['minute'] for h in hdr}
        header_cols = sorted(minute_by_col)

        merges = {(m.min_row, m.min_col): m for m in ws.merged_cells.ranges}
        for m in ws.merged_cells.ranges:
            if m.max_row != m.min_row:
                raise WorkbookError(f'{sheet}!{m}: a merge spanning rows has no defined meaning')
        covered = {(r, c) for m in ws.merged_cells.ranges
                   for r in range(m.min_row, m.max_row + 1) for c in range(m.min_col, m.max_col + 1)
                   if (r, c) != (m.min_row, m.min_col)}

        for r in range(FIRST_DATA_ROW, ws.max_row + 1):
            a = ws.cell(r, 1).value
            teacher_raw = '' if a is None else str(a)
            if teacher_raw.strip():
                teacher_rows.append({'sheet': sheet, 'day_of_week': day, 'row': r, 'teacher_raw': teacher_raw})
            for c in range(FIRST_TIME_COLUMN, ws.max_column + 1):
                if (r, c) in covered:
                    if ws.cell(r, c).value is not None:
                        raise WorkbookError(f'{sheet}!{get_column_letter(c)}{r}: text inside a merged block')
                    continue
                cell = ws.cell(r, c)
                merge = merges.get((r, c))
                ref = f'{get_column_letter(c)}{r}'
                fill = cell.fill.fgColor.rgb if cell.fill is not None and cell.fill.fill_type else None
                fill = fill if isinstance(fill, str) else None
                value = cell.value
                if value is None or not str(value).strip():
                    if value is not None or merge is not None:
                        non_lessons.append({'sheet': sheet, 'cell': ref, 'raw': value, 'merge': str(merge) if merge else None,
                                            'fill': fill, 'reason': 'whitespace-only cell' if value is not None else 'empty merged block (no text)'})
                    continue

                text = str(value)
                flags: list[str] = []
                last = merge.max_col if merge else c
                span = last - c + 1
                start = minute_by_col.get(c)
                if start is None:
                    flags.append('NO_HEADER_TIME')
                headerless = [get_column_letter(k) for k in range(c, last + 1) if k not in minute_by_col]
                if headerless and start is not None:
                    flags.append('BLOCK_COVERS_HEADERLESS_COLUMN:' + ','.join(headerless))
                following = [k for k in header_cols if k > last]
                end_by_headers = minute_by_col[following[0]] if following else None
                dur_by_headers = (end_by_headers - start) if (end_by_headers is not None and start is not None) else None
                if start is not None and dur_by_headers is not None and dur_by_headers != span * SLOT_MINUTES:
                    flags.append(f'HEADER_GAP_DURATION_AMBIGUOUS(span={span * SLOT_MINUTES},headers={dur_by_headers})')
                if start is not None and start >= 1440:
                    flags.append('HEADER_AFTER_MIDNIGHT_NEXT_CALENDAR_DAY')
                elif start is not None and start + span * SLOT_MINUTES > 1440:
                    flags.append('CROSSES_MIDNIGHT')
                if DIGITS.search(text):
                    flags.append('TIME_ANNOTATION_IN_TEXT')
                if not teacher_raw.strip():
                    flags.append('NO_TEACHER_IN_ROW')
                if not isinstance(value, str):
                    flags.append('NON_TEXT_VALUE')

                lessons.append(LessonCell(
                    sheet=sheet, day_of_week=day, cell=ref, row=r, col=c, teacher_raw=teacher_raw,
                    header_raw=_header_label(ws.cell(1, c).value), start_minute=start, span_columns=span,
                    duration_minutes=span * SLOT_MINUTES, duration_by_headers=dur_by_headers,
                    merge=str(merge) if merge else None, text_raw=text, fill=fill, flags=flags))

    if seen_days != set(range(7)):
        raise WorkbookError(f'expected 7 day sheets, found days {sorted(seen_days)}')
    return ParsedWorkbook(path=path, sha256=file_sha256(path), lessons=lessons,
                          non_lessons=non_lessons, teacher_rows=teacher_rows, headers=headers)

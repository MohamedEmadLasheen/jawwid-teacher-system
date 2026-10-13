"""Source-to-database reconciliation: one outcome per workbook lesson cell.

Outcomes
  ALREADY_PRESENT  an active/trial lesson with the same teacher, day, start
                   minute, duration and participants already exists. Nothing
                   is written.
  IMPORT           every identity is confirmed, every field is unambiguous and
                   nothing overlaps: the lesson is written with exactly the
                   source values.
  PENDING          kept out of the write, with every blocking reason and the
                   decision that would resolve it. The source values are kept.
  REJECTED         the cell can never be a lesson as written (reserved; the
                   current workbook produces none).

Matching is by content and confirmed identity, never by cell coordinate: the
2026-10-06 import's source_cell values refer to an older layout of the sheet.
An existing lesson is never moved, ended, replaced or edited here.
"""
from __future__ import annotations

import itertools
from collections import defaultdict
from dataclasses import dataclass, field, asdict

from .identity import (Snapshot, StudentResolver, TeacherMap, cell_matches_names, is_malformed_student_name,
                       participant_names, ws)

# Why a cell is pending, and what would unblock it. Order = reporting priority.
DECISIONS = {
    'NO_TEACHER_IN_ROW': 'The row has no teacher name. State which teacher teaches this lesson.',
    'TEACHER_UNMAPPED': 'Add this teacher spelling to teacher_identity_map.json with evidence.',
    'TEACHER_UNRESOLVED': 'Resolve the teacher identity named in the teacher classification report.',
    'NEXT_DAY_HEADER': 'The column header is midnight or later, after the sheet\'s 11:30 PM column. Confirm the calendar day the lesson belongs to (the data model stores a day plus 00:00-23:59, so this is the following day at that time).',
    'HEADER_GAP': 'The headers around this block skip a column, so the duration is either the merged width or the header gap. Confirm the duration.',
    'TIME_ANNOTATION': 'The cell text carries a time/duration that differs from its column. Confirm whether the annotation is the start time, the end time or the duration; both values are preserved in the report.',
    'CELL_NOTE': 'The cell carries a note or title (bracketed subject, "أ." prefix). Confirm who the student is.',
    'STUDENT_MISSING': 'At least one named student has no Teacher System record. Create the student through the normal enrolment flow (or identify the existing record), then re-run.',
    'STUDENT_AMBIGUOUS': 'Several student records fit and no evidence singles one out. Identify the record.',
    'STUDENT_UNCERTAIN': 'The name is a bare first name shared by several students, with no history with this teacher. Identify the record.',
    'EXISTING_LESSON_DIFFERS': 'The teacher already has a different lesson overlapping this time. Decide which is correct; the existing appointment is kept until then.',
    'POSSIBLE_RESCHEDULE': 'The same teacher already teaches this student on this day at a different time, and that lesson is not in the workbook. Decide whether the lesson moved; the existing appointment is kept until then.',
    'STUDENT_DOUBLE_BOOKED': 'A student in this cell already has an overlapping lesson with another teacher. Decide which is correct.',
    'SOURCE_OVERLAP': 'Two importable cells in the workbook overlap (same teacher or same student). Correct the workbook.',
}


@dataclass
class Outcome:
    sheet: str
    cell: str
    row: int
    day_of_week: int
    teacher_raw: str
    header_raw: str
    start_minute: int | None
    duration_minutes: int
    duration_by_headers: int | None
    merge: str | None
    text_raw: str
    fill: str | None
    flags: list
    status: str = ''
    reasons: list = field(default_factory=list)     # codes from DECISIONS
    details: list = field(default_factory=list)     # human-readable specifics
    teacher_status: str = ''
    teacher_id: str | None = None
    teacher_classification: str | None = None
    teacher_basis: str | None = None
    student_ids: list | None = None
    student_basis: str = ''
    existing_lesson_id: str | None = None
    existing_note: str = ''
    related_lesson_ids: list = field(default_factory=list)
    source_key: str = ''                            # value written to lessons.source_cell

    def to_dict(self) -> dict:
        return asdict(self)

    def pend(self, code: str, detail: str = ''):
        if code not in self.reasons:
            self.reasons.append(code)
        if detail:
            self.details.append(detail)


def _overlap(a0, a1, b0, b1):
    return a0 < b1 and b0 < a1


def reconcile(parsed, tmap: TeacherMap, snap: Snapshot, evidence: dict) -> dict:
    map_problems = tmap.validate_against(snap, evidence)
    resolver = StudentResolver(snap)
    booked = snap.booked()
    booked_by_teacher_day = defaultdict(list)
    for l in booked:
        booked_by_teacher_day[(l['teacher_id'], l['day_of_week'])].append(l)
    by_source = {(l['source_sheet'], l['source_cell']): l for l in snap.lessons if l.get('source_sheet')}

    outcomes: list[Outcome] = []
    for c in parsed.lessons:
        o = Outcome(sheet=c.sheet, cell=c.cell, row=c.row, day_of_week=c.day_of_week, teacher_raw=c.teacher_raw,
                    header_raw=c.header_raw, start_minute=c.start_minute, duration_minutes=c.duration_minutes,
                    duration_by_headers=c.duration_by_headers, merge=c.merge, text_raw=c.text_raw, fill=c.fill,
                    flags=list(c.flags), source_key=f'{c.cell}@{parsed.short_sha}')
        tr = tmap.resolve(c.teacher_raw)
        o.teacher_status, o.teacher_id, o.teacher_classification, o.teacher_basis = tr.status, tr.teacher_id, tr.classification, tr.basis

        # 0. Imported by an earlier run of this importer from this same workbook.
        prior = by_source.get((c.sheet, o.source_key))
        if prior is not None:
            o.status, o.existing_lesson_id = 'ALREADY_PRESENT', prior['id']
            o.existing_note = 'imported earlier from this same workbook (provenance key match)'
            outcomes.append(o)
            continue

        # 1. Same lesson already on the schedule (content + identity).
        candidates = [tr.teacher_id] if tr.teacher_id else list(tr.candidates)
        if c.start_minute is not None:
            for tid in candidates:
                for l in booked_by_teacher_day.get((tid, c.day_of_week), []):
                    if (l['start_minute'] == c.start_minute and l['duration_minutes'] == c.duration_minutes
                            and cell_matches_names(c.text_raw, participant_names(snap, l))):
                        o.status, o.existing_lesson_id = 'ALREADY_PRESENT', l['id']
                        o.student_ids = sorted(p['student_id'] for p in l['parts'])
                        o.student_basis = 'EXISTING_LESSON'
                        notes = []
                        if tr.status != 'CONFIRMED':
                            notes.append(f'the row\'s teacher identity is unresolved; the existing lesson is on candidate {tid}')
                        if 'TIME_ANNOTATION_IN_TEXT' in c.flags:
                            notes.append('the cell carries a time annotation; the existing lesson uses the column time')
                        if any(is_malformed_student_name(snap.students[p['student_id']]['full_name'])
                               for p in l['parts'] if p['student_id'] in snap.students):
                            notes.append('an existing participant record carries source text (digits/asterisks/brackets) in its name')
                        o.existing_note = '; '.join(notes)
                        break
                if o.status:
                    break
        if o.status:
            outcomes.append(o)
            continue

        # 2. Everything that blocks an automatic write.
        if 'NO_TEACHER_IN_ROW' in c.flags:
            o.pend('NO_TEACHER_IN_ROW')
        elif tr.status == 'UNMAPPED':
            o.pend('TEACHER_UNMAPPED', f'"{ws(c.teacher_raw)}"')
        elif tr.status == 'UNRESOLVED':
            o.pend('TEACHER_UNRESOLVED', tr.note)
        for f in c.flags:
            if f.startswith('HEADER_AFTER_MIDNIGHT') or f.startswith('CROSSES_MIDNIGHT'):
                o.pend('NEXT_DAY_HEADER', f'header "{c.header_raw}" after 11:30 PM = {c.start_minute // 60:02d}:{c.start_minute % 60:02d} on the reconstructed axis')
            elif f.startswith('HEADER_GAP') or f.startswith('BLOCK_COVERS_HEADERLESS') or f == 'NO_HEADER_TIME':
                o.pend('HEADER_GAP', f)
            elif f == 'TIME_ANNOTATION_IN_TEXT':
                o.pend('TIME_ANNOTATION', f'column time {c.header_raw} ({c.start_minute // 60:02d}:{c.start_minute % 60:02d}), cell text "{ws(c.text_raw)}"')
        sr = resolver.resolve(c.text_raw, tr.teacher_id)
        o.student_ids, o.student_basis = sr.student_ids, sr.basis
        for issue in sr.issues:
            if issue.startswith(('PARENTHETICAL', 'TITLE_PREFIX', 'TRAILING')):
                o.pend('CELL_NOTE', issue)
            elif issue.startswith('STUDENT_AMBIGUOUS'):
                o.pend('STUDENT_AMBIGUOUS', issue)
            elif issue.startswith('STUDENT_UNRESOLVED'):
                if 'no student record' in issue:
                    o.pend('STUDENT_MISSING', issue)
                if 'candidate student records' in issue:
                    o.pend('STUDENT_AMBIGUOUS', issue)
                if 'bare first name' in issue:
                    o.pend('STUDENT_UNCERTAIN', issue)

        # 3. Overlaps with the existing schedule (never resolved here).
        if tr.teacher_id and c.start_minute is not None and c.start_minute < 1440:
            s0, s1 = c.start_minute, c.start_minute + c.duration_minutes
            for l in booked_by_teacher_day.get((tr.teacher_id, c.day_of_week), []):
                if _overlap(s0, s1, l['start_minute'], l['start_minute'] + l['duration_minutes']):
                    o.pend('EXISTING_LESSON_DIFFERS', f'existing lesson {l["id"]} {l["start_minute"] // 60:02d}:{l["start_minute"] % 60:02d}/{l["duration_minutes"]}m')
                    o.related_lesson_ids.append(l['id'])
            if o.student_ids:
                for l in booked:
                    if l['day_of_week'] != c.day_of_week or l['teacher_id'] == tr.teacher_id:
                        continue
                    shared = set(o.student_ids) & {p['student_id'] for p in l['parts']}
                    if shared and _overlap(s0, s1, l['start_minute'], l['start_minute'] + l['duration_minutes']):
                        o.pend('STUDENT_DOUBLE_BOOKED', f'existing lesson {l["id"]} (teacher {l["teacher_id"]})')
                        o.related_lesson_ids.append(l['id'])
        outcomes.append(o)

    # 4. Existing active lessons that no cell reproduces: listed, never touched.
    matched = {o.existing_lesson_id for o in outcomes if o.existing_lesson_id}
    unmatched_booked = [l for l in booked if l['id'] not in matched]
    for o in outcomes:
        if o.status or not o.teacher_id or not o.student_ids:
            continue
        for l in unmatched_booked:
            if (l['teacher_id'] == o.teacher_id and l['day_of_week'] == o.day_of_week
                    and set(o.student_ids) & {p['student_id'] for p in l['parts']}
                    and l['id'] not in o.related_lesson_ids):
                o.pend('POSSIBLE_RESCHEDULE', f'existing lesson {l["id"]} at {l["start_minute"] // 60:02d}:{l["start_minute"] % 60:02d}/{l["duration_minutes"]}m; workbook {o.start_minute // 60:02d}:{o.start_minute % 60:02d}/{o.duration_minutes}m')
                o.related_lesson_ids.append(l['id'])

    # 5. Overlaps among the cells that would otherwise be written.
    ready = [o for o in outcomes if not o.status and not o.reasons]
    for a, b in itertools.combinations(ready, 2):
        if a.day_of_week != b.day_of_week:
            continue
        if not _overlap(a.start_minute, a.start_minute + a.duration_minutes, b.start_minute, b.start_minute + b.duration_minutes):
            continue
        if a.teacher_id == b.teacher_id or set(a.student_ids) & set(b.student_ids):
            a.pend('SOURCE_OVERLAP', f'{b.sheet}!{b.cell}')
            b.pend('SOURCE_OVERLAP', f'{a.sheet}!{a.cell}')

    for o in outcomes:
        if not o.status:
            o.status = 'PENDING' if o.reasons else 'IMPORT'
        o.reasons.sort(key=list(DECISIONS).index)

    # 6. Active lessons from the 2026-10-06 import that no cell reproduces. Each
    # is either CHANGED_IN_WORKBOOK (a cell for the same teacher, day and
    # student exists at another time/duration — a possible reschedule) or
    # NOT_IN_WORKBOOK. Both are reported; neither is touched.
    db_only = []
    for l in snap.lessons:
        if not l.get('source_sheet') or l['lifecycle_status'] != 'active' or l['id'] in matched:
            continue
        students = {p['student_id'] for p in l['parts']}
        cells = [f'{o.sheet}!{o.cell}' for o in outcomes
                 if o.teacher_id == l['teacher_id'] and o.day_of_week == l['day_of_week'] and o.student_ids
                 and set(o.student_ids) & students]
        db_only.append(dict(l, category='CHANGED_IN_WORKBOOK' if cells else 'NOT_IN_WORKBOOK', workbook_cells=cells))
    return {'outcomes': outcomes, 'map_problems': map_problems, 'db_only_lessons': db_only}

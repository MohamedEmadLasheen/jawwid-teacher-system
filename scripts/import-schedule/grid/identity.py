"""Teacher and student identity resolution.

Nothing here guesses. A teacher is resolved only through the version-controlled
teacher_identity_map.json, and each confirmed entry's evidence is re-checked
against the database on every run. A student is resolved only when the
Teacher System already holds exactly one well-formed record the evidence
points to; otherwise the source lesson stays pending with the reason.
"""
from __future__ import annotations

import itertools
import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass

# --------------------------------------------------------------------------
# Text normalisation
# --------------------------------------------------------------------------

def ws(text: str | None) -> str:
    """Whitespace/tatweel-insensitive form. The ONLY normalisation used to
    MATCH a name; it changes no letter."""
    return re.sub(r'\s+', ' ', (text or '').replace('ـ', '')).strip()


def orthographic_key(text: str | None) -> str:
    """Arabic orthographic variants folded together (ة/ه, ى/ي, hamza seats,
    spacing). Used only to DETECT that two spellings may be one name — never
    on its own to choose a record."""
    s = ws(text)
    for a, b in (('ة', 'ه'), ('ى', 'ي'), ('أ', 'ا'), ('إ', 'ا'), ('آ', 'ا'), (' ', '')):
        s = s.replace(a, b)
    return s


# A student record whose name carries a time, a teacher/subject note, a
# returning-marker or several people is not a verified identity.
MALFORMED_NAME = re.compile(r'[0-9٠-٩()*/&]|\sو\s')


def is_malformed_student_name(name: str) -> bool:
    return bool(MALFORMED_NAME.search(ws(name)))


def segmentations(text: str) -> list[tuple[str, ...]]:
    """Every reading of a cell as a list of names.

    '&' and a standalone 'و' always separate names. A word that starts with
    'و' after the first word is either "and <name>" or a name that itself
    begins with و (وسام, وائل, وديمة ...) — both readings are produced, and the
    caller accepts the cell only if exactly one reading resolves.
    """
    toks = ws(text).replace('&', ' & ').split()
    options = []
    for i, t in enumerate(toks):
        if t in ('&', 'و'):
            options.append([('SEP', None)])
        elif t.startswith('و') and len(t) > 1 and i > 0:
            options.append([('SEPNAME', t[1:]), ('TOK', t)])
        else:
            options.append([('TOK', t)])
    readings = set()
    for combo in itertools.product(*options):
        parts, cur = [], []
        for kind, v in combo:
            if kind == 'SEP':
                if cur:
                    parts.append(' '.join(cur)); cur = []
            elif kind == 'SEPNAME':
                if cur:
                    parts.append(' '.join(cur))
                cur = [v]
            else:
                cur.append(v)
        if cur:
            parts.append(' '.join(cur))
        if parts:
            readings.add(tuple(parts))
    return sorted(readings)


def preferred_reading(text: str, known_first_names: set) -> tuple | None:
    """The one reading of a group cell that recorded names support, or None.

    A word "وX" after the first word is read as "and X" when X is a known first
    name and "وX" is not; kept whole when "وX" is a known first name and X is
    not. If any such word fits both ways or neither, the cell is undecidable
    and None is returned — the caller keeps it for a person to segment.
    """
    toks = ws(text).replace('&', ' & ').split()
    parts, cur = [], []
    for i, t in enumerate(toks):
        if t in ('&', 'و'):
            if cur:
                parts.append(' '.join(cur)); cur = []
        elif t.startswith('و') and len(t) > 1 and i > 0:
            as_and, as_name = t[1:] in known_first_names, t in known_first_names
            if as_and == as_name:
                return None
            if as_and:
                if cur:
                    parts.append(' '.join(cur))
                cur = [t[1:]]
            else:
                cur.append(t)
        else:
            cur.append(t)
    if cur:
        parts.append(' '.join(cur))
    return tuple(parts) if parts else None


# --------------------------------------------------------------------------
# Database snapshot view
# --------------------------------------------------------------------------

GRID_IMPORT_KEY = re.compile(r'^[A-Z]+[0-9]+@[0-9a-f]{12}$')


def is_grid_import(lesson: dict) -> bool:
    """A lesson this importer wrote (provenance key "<cell>@<workbook sha12>").

    Such lessons are never identity EVIDENCE: they record a resolution the
    importer already made, so counting them would let one run's output
    resolve the next run's input — planning would not be a fixed point."""
    return bool(lesson.get('source_cell') and GRID_IMPORT_KEY.match(lesson['source_cell']))

@dataclass
class Snapshot:
    teachers: dict           # id -> row
    students: dict           # id -> row (all, incl. deleted)
    lessons: list            # rows, each with 'parts': [{'student_id'}]
    shift_assignments: list  # active assignment x active template rows

    @classmethod
    def from_dict(cls, d: dict) -> 'Snapshot':
        return cls(teachers={t['id']: t for t in d['teachers']},
                   students={s['id']: s for s in d['students']},
                   lessons=d['lessons'], shift_assignments=d['shift_assignments'])

    def roster_teacher_ids(self) -> set:
        return {a['teacher_id'] for a in self.shift_assignments if a['is_active'] and a['t_active']}

    def booked(self) -> list:
        return [l for l in self.lessons if l['lifecycle_status'] in ('trial', 'active')]


# --------------------------------------------------------------------------
# Teacher identity map
# --------------------------------------------------------------------------

CONFIRMED_BASES = {'EXISTING_SCHEDULE', 'HISTORY_ESTABLISHED', 'HISTORY_ESTABLISHED_OVER_DUPLICATE', 'SINGLE_PLAUSIBLE_RECORD'}
MIN_HISTORY_MATCHES = 3


@dataclass
class TeacherResolution:
    sheet_spelling: str
    status: str                    # CONFIRMED | UNRESOLVED | UNMAPPED
    teacher_id: str | None
    classification: str | None     # 'shift' (the 14 roster teachers) | 'hourly' | None
    basis: str | None
    candidates: list
    note: str


class TeacherMap:
    def __init__(self, data: dict):
        self.data = data
        self.by_spelling: dict[str, dict] = {}
        for entry in data['teachers']:
            for sp in entry['sheet_spellings']:
                key = ws(sp)
                if key in self.by_spelling:
                    raise ValueError(f'sheet spelling {sp!r} appears in two map entries')
                self.by_spelling[key] = entry
        ids = [e['teacher_id'] for e in data['teachers'] if e.get('teacher_id')]
        dup = [i for i, n in Counter(ids).items() if n > 1]
        if dup:
            raise ValueError(f'teacher ids mapped by more than one entry: {dup}')
        for e in data['teachers']:
            if e['status'] == 'CONFIRMED' and (not e.get('teacher_id') or e.get('basis') not in CONFIRMED_BASES):
                raise ValueError(f'confirmed entry {e["sheet_spellings"]} needs a teacher_id and a known basis')
            if e['status'] == 'UNRESOLVED' and e.get('teacher_id'):
                raise ValueError(f'unresolved entry {e["sheet_spellings"]} must not carry a teacher_id')

    @classmethod
    def load(cls, path: str) -> 'TeacherMap':
        with open(path, encoding='utf-8') as f:
            return cls(json.load(f))

    @property
    def shift_roster_ids(self) -> set:
        return set(self.data['shift_roster_teacher_ids'])

    def validate_against(self, snap: Snapshot, evidence: dict) -> list[str]:
        """Re-checks every confirmed entry against the live database and the
        recomputed evidence. Returns problems; an entry with a problem is
        treated as UNRESOLVED by resolve()."""
        problems = []
        live_roster = snap.roster_teacher_ids()
        if live_roster != self.shift_roster_ids:
            problems.append(f'ROSTER_CHANGED: live shift roster {sorted(live_roster)} != map baseline')
        self._invalid = set()
        for e in self.data['teachers']:
            if e['status'] != 'CONFIRMED':
                continue
            tid, basis, key = e['teacher_id'], e['basis'], ws(e['sheet_spellings'][0])
            t = snap.teachers.get(tid)
            err = None
            if t is None:
                err = 'teacher row not found'
            elif t['is_deleted']:
                err = 'teacher row is soft-deleted'
            elif basis == 'EXISTING_SCHEDULE' and tid not in self.shift_roster_ids:
                err = 'EXISTING_SCHEDULE basis is reserved for the 14 roster teachers'
            elif basis != 'EXISTING_SCHEDULE' and tid in self.shift_roster_ids:
                err = 'a roster teacher must use the EXISTING_SCHEDULE basis'
            else:
                ev = Counter()
                for sp in e['sheet_spellings']:
                    ev.update(evidence.get(ws(sp), {}))
                cands = e.get('candidates') or [tid]
                if tid not in cands:
                    err = 'teacher_id is not among the listed candidates'
                elif basis == 'SINGLE_PLAUSIBLE_RECORD' and cands != [tid]:
                    err = 'SINGLE_PLAUSIBLE_RECORD requires exactly one candidate'
                elif basis in ('HISTORY_ESTABLISHED', 'HISTORY_ESTABLISHED_OVER_DUPLICATE', 'EXISTING_SCHEDULE'):
                    if ev[tid] < MIN_HISTORY_MATCHES:
                        err = f'only {ev[tid]} matching lessons on record (need {MIN_HISTORY_MATCHES})'
                    elif basis == 'HISTORY_ESTABLISHED_OVER_DUPLICATE' and any(ev[c] for c in cands if c != tid):
                        err = 'a duplicate candidate also has matching lessons'
            if err:
                self._invalid.add(key)
                problems.append(f'{e["sheet_spellings"]}: {err}')
        return problems

    def resolve(self, teacher_raw: str) -> TeacherResolution:
        key = ws(teacher_raw)
        if not key:
            return TeacherResolution('', 'UNRESOLVED', None, None, None, [], 'the row has no teacher name')
        e = self.by_spelling.get(key)
        if e is None:
            return TeacherResolution(key, 'UNMAPPED', None, None, None, [], 'this spelling is not in teacher_identity_map.json')
        if e['status'] != 'CONFIRMED' or key in getattr(self, '_invalid', set()):
            return TeacherResolution(key, 'UNRESOLVED', None, None, None, e.get('candidates', []),
                                     e.get('decision_required') or 'confirmed mapping failed re-validation')
        tid = e['teacher_id']
        cls = 'shift' if tid in self.shift_roster_ids else 'hourly'
        return TeacherResolution(key, 'CONFIRMED', tid, cls, e['basis'], e.get('candidates') or [tid], e.get('evidence', ''))


# --------------------------------------------------------------------------
# Evidence: which DB teacher has taught exactly this cell's students at
# exactly this day and start minute (any lifecycle, any era)
# --------------------------------------------------------------------------

def participant_names(snap: Snapshot, lesson: dict) -> list[str]:
    return sorted(ws(snap.students[p['student_id']]['full_name']) for p in lesson['parts'] if p['student_id'] in snap.students)


def cell_matches_names(text: str, names: list[str]) -> bool:
    if not names:
        return False
    if names == [ws(text)] or names == [ws(text.replace('*', ''))]:
        return True
    return any(sorted(seg) == names for seg in segmentations(text.replace('*', '')))


def teacher_evidence(cells: list, snap: Snapshot) -> dict:
    """sheet spelling -> Counter(teacher_id -> number of that teacher's lessons
    reproduced exactly (day, start, participant names) by this spelling's cells)."""
    by_slot = defaultdict(list)
    for l in snap.lessons:
        by_slot[(l['day_of_week'], l['start_minute'])].append(l)
    out = defaultdict(Counter)
    for c in cells:
        for l in by_slot.get((c.day_of_week, c.start_minute), []):
            if is_grid_import(l):
                continue
            if cell_matches_names(c.text_raw, participant_names(snap, l)):
                out[ws(c.teacher_raw)][l['teacher_id']] += 1
    return out


# --------------------------------------------------------------------------
# Student resolution
# --------------------------------------------------------------------------

@dataclass
class StudentResolution:
    student_ids: list | None
    basis: str          # see BASES below
    issues: list


class StudentResolver:
    """Resolves a cell's student names to existing, well-formed records.

    Accepted evidence, strongest first:
      HISTORY                     exact, unique spelling; this teacher has taught that record
      HISTORY_DISAMBIGUATED       several records share the spelling; exactly one of them was taught by this teacher
      EXACT_UNIQUE_NAME           exact, unique spelling with no orthographic twin; a multi-word name
      VARIANT_SOLE_RECORD_HISTORY the only record is an orthographic variant (ة/ه, ى/ي ...) and this teacher taught it
    Everything else is unresolved and the lesson stays pending.
    """

    def __init__(self, snap: Snapshot, decisions: dict | None = None):
        self.snap = snap
        # Owner-approved resolutions from student_identity_decisions.json, keyed
        # by (teacher id, name exactly as written) — never by sheet cell, so a
        # decision survives the next version of the workbook.
        self.decisions = {}
        for d in (decisions or {}).get('resolutions', []):
            if d.get('approved_by') and d.get('student_id'):
                self.decisions[(d['teacher_id'], ws(d['name']))] = d['student_id']
        self.valid = {sid: s for sid, s in snap.students.items()
                      if not s['is_deleted'] and not is_malformed_student_name(s['full_name'])}
        self.by_exact = defaultdict(list)
        self.by_key = defaultdict(list)
        for sid, s in self.valid.items():
            self.by_exact[ws(s['full_name'])].append(sid)
            self.by_key[orthographic_key(s['full_name'])].append(sid)
        self.first_word = Counter(ws(s['full_name']).split(' ')[0] for s in self.valid.values())
        self.taught = defaultdict(set)
        for l in snap.lessons:
            if is_grid_import(l):
                continue
            for p in l['parts']:
                self.taught[l['teacher_id']].add(p['student_id'])

    def _part(self, part: str, teacher_id: str | None):
        decided = self.decisions.get((teacher_id, part))
        if decided is not None:
            s = self.snap.students.get(decided)
            if s is None or s['is_deleted']:
                return None, None, f'"{part}": the approved decision points at a missing or deleted student record'
            return [decided], 'OWNER_DECISION', None
        exact = self.by_exact.get(part, [])
        variants = self.by_key.get(orthographic_key(part), [])
        pool = sorted(set(exact) | set(variants))
        taught = self.taught.get(teacher_id, set())
        if len(exact) == 1 and len(variants) == 1:
            if exact[0] in taught:
                return exact, 'HISTORY', None
            if len(part.split(' ')) == 1 and self.first_word[part] > 1:
                return None, None, f'"{part}" is a bare first name shared by {self.first_word[part]} students and was never taught by this teacher'
            if len(part.split(' ')) == 1:
                return None, None, f'"{part}" is a bare first name with no lesson history with this teacher'
            return exact, 'EXACT_UNIQUE_NAME', None
        taught_exact = [i for i in exact if i in taught]
        if len(exact) > 1 and len(taught_exact) == 1 and not [i for i in variants if i in taught and i not in exact]:
            return taught_exact, 'HISTORY_DISAMBIGUATED', None
        if not exact and len(pool) == 1 and pool[0] in taught:
            return pool, 'VARIANT_SOLE_RECORD_HISTORY', None
        if not pool:
            return None, None, f'"{part}": no student record with this name (a new student record would be required)'
        return None, None, f'"{part}": {len(pool)} candidate student records and the evidence does not single one out'

    def resolve(self, text: str, teacher_id: str | None) -> StudentResolution:
        clean = ws(text.replace('*', ''))
        issues = []
        if '(' in clean or ')' in clean:
            issues.append('PARENTHETICAL_NOTE_IN_CELL: confirm whether the bracketed text is a subject/note and who the student is')
        if re.match(r'^(أ|ا)\s*\.', clean):
            issues.append('TITLE_PREFIX: "أ." marks an adult/staff learner; confirm the student identity')
        if clean.endswith('.'):
            issues.append('TRAILING_PUNCTUATION_IN_CELL')
        if not teacher_id:
            return StudentResolution(None, 'NOT_ATTEMPTED', issues)
        readings, failures = {}, []
        for seg in segmentations(clean):
            ids, bases, ok = [], [], True
            for part in seg:
                got, basis, why = self._part(part, teacher_id)
                if got is None:
                    ok = False; failures.append(why); break
                ids += got; bases.append(basis)
            if ok and len(set(ids)) == len(ids):
                readings.setdefault(tuple(sorted(ids)), bases)
        if not readings:
            return StudentResolution(None, 'UNRESOLVED', issues + ['STUDENT_UNRESOLVED: ' + '; '.join(dict.fromkeys(failures))])
        if len(readings) > 1:
            return StudentResolution(None, 'AMBIGUOUS', issues + [f'STUDENT_AMBIGUOUS: {len(readings)} different readings of the cell each resolve to existing students'])
        ids, bases = next(iter(readings.items()))
        order = ['VARIANT_SOLE_RECORD_HISTORY', 'EXACT_UNIQUE_NAME', 'HISTORY_DISAMBIGUATED', 'OWNER_DECISION', 'HISTORY']
        return StudentResolution(list(ids), min(bases, key=order.index), issues)

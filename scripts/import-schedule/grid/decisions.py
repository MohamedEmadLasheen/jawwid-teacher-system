"""Decision workbook: one row per pending source lesson, the strict audit of
every proposal, and the owner's case categories. Read-only; contains student
names, so it is written only under the git-ignored dry-run folder.

Strict audit rules (owner directive 2026-10-14):
  student match by name + responsible Admin passes only if the cell colour is
  an exact member of a known Admin colour family, exactly one same-named
  record carries that Admin, that record is not booked with another teacher at
  an overlapping time that day, no other same-named candidate has lesson
  history with this teacher, and the same (teacher, name) is not proposed for
  two records. A bare first name with one record is never auto-approved.
  A new student record is eligible only for a full name (two or more words),
  an exact Admin colour, and no same-name proposal under another Admin.
"""
from __future__ import annotations

import copy
from collections import Counter, defaultdict

import openpyxl
from openpyxl.styles import Font, PatternFill

from .identity import Snapshot, StudentResolver, orthographic_key, preferred_reading, segmentations, ws
from .proposals import colour_to_admin
from .reconcile import DECISIONS, reconcile

DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
hm = lambda m: '' if m is None else f'{(m // 60) % 24:02d}:{m % 60:02d}' + (' (+1 day)' if m >= 1440 else '')

CASES = [
    ('1 Teacher identity', {'TEACHER_UNRESOLVED', 'TEACHER_UNMAPPED'}),
    ('2 Students', {'STUDENT_MISSING', 'STUDENT_AMBIGUOUS', 'STUDENT_UNCERTAIN', 'STUDENT_DECISION_INVALID', 'STUDENT_UNRESOLVED_OTHER'}),
    ('3 Time annotations', {'TIME_ANNOTATION'}),
    ('4 Appointment conflicts', {'EXISTING_LESSON_DIFFERS', 'STUDENT_DOUBLE_BOOKED', 'SOURCE_OVERLAP'}),
    ('5 Possible reschedules', {'POSSIBLE_RESCHEDULE'}),
    ('6 Midnight-day boundary', {'NEXT_DAY_HEADER'}),
    ('7 Missing teacher names', {'NO_TEACHER_IN_ROW'}),
    ('9 Other source data', {'CELL_NOTE', 'HEADER_GAP'}),
]


def _sheet(wb, title, header, rows, widths=()):
    s = wb.create_sheet(title)
    s.append(header)
    for c in s[1]:
        c.font = Font(bold=True)
        c.fill = PatternFill('solid', fgColor='DDDDDD')
    for r in rows:
        s.append(r)
    s.freeze_panes = 'A2'
    s.auto_filter.ref = s.dimensions
    for i, w in enumerate(widths, 1):
        s.column_dimensions[openpyxl.utils.get_column_letter(i)].width = w


def audit(parsed, tmap, raw, evidence, plan, props) -> dict:
    snap = Snapshot.from_dict(raw)
    resolver = StudentResolver(snap)
    colours = colour_to_admin(raw.get('supervisors', []))
    admin_of = {s['id']: s.get('supervisor_id') for s in raw['students']}
    cells = {f'{o["sheet"]}!{o["cell"]}': o for o in plan['outcomes']}
    booked = snap.booked()

    res_audit = []
    for r in props['student_resolutions']:
        fails = []
        if r['basis'] == 'SOLE_RECORD_NEEDS_CONFIRMATION':
            fails.append('first name only with a single record: never approved automatically')
        else:
            for c in r['cells']:
                fill = (cells[c]['fill'] or '')[-6:].upper()
                if colours.get(fill) != r['supervisor_id']:
                    fails.append(f'{c}: cell colour {fill or "none"} is not an exact member of the Admin\'s colour family')
            if [i for i in r['candidates'] if admin_of.get(i) == r['supervisor_id']] != [r['student_id']]:
                fails.append('not exactly one same-named record with that Admin')
            taught = resolver.taught.get(r['teacher_id'], set())
            if any(i in taught for i in r['candidates'] if i != r['student_id']):
                fails.append('another same-named record has lesson history with this teacher')
            for c in r['cells']:
                o = cells[c]
                for l in booked:
                    if (l['teacher_id'] != r['teacher_id'] and l['day_of_week'] == o['day_of_week']
                            and r['student_id'] in {p['student_id'] for p in l['parts']}
                            and o['start_minute'] < l['start_minute'] + l['duration_minutes']
                            and l['start_minute'] < o['start_minute'] + o['duration_minutes']):
                        fails.append(f'{c}: the record is already booked with another teacher at an overlapping time')
        res_audit.append(dict(r, verdict='PASS' if not fails else 'FAIL', fail_reasons=fails))

    new_audit = []
    same_name = set(props['new_students_same_name_different_admin'])
    for r in props['new_students']:
        fails = []
        if len(r['full_name'].split()) < 2:
            fails.append('first name only: not enough to establish a new identity')
        if not r['supervisor_id']:
            fails.append('cell colour is not an Admin colour: no responsible Admin')
        if r['full_name'] in same_name:
            fails.append('the same name is proposed under two different Admins')
        new_audit.append(dict(r, verdict='ELIGIBLE' if not fails else 'PENDING', fail_reasons=fails))

    # Strict simulation: only PASS resolutions and ELIGIBLE new students.
    decisions = {'resolutions': [{'teacher_id': r['teacher_id'], 'name': r['name'], 'student_id': r['student_id'], 'approved_by': 'SIMULATION'}
                                 for r in res_audit if r['verdict'] == 'PASS']}
    raw2 = copy.deepcopy(raw)
    for r in new_audit:
        if r['verdict'] == 'ELIGIBLE':
            raw2['students'].append({'id': r['proposed_id'], 'full_name': r['full_name'], 'status': 'active', 'is_deleted': False,
                                     'supervisor_id': r['supervisor_id'], 'created_at': 'proposed'})
            decisions['resolutions'] += [{'teacher_id': t, 'name': r['full_name'], 'student_id': r['proposed_id'], 'approved_by': 'SIMULATION'}
                                         for t in r['teachers']]
    only_res = {'resolutions': [d for d in decisions['resolutions'] if not d['student_id'] in {x['proposed_id'] for x in new_audit}]}
    a = reconcile(parsed, tmap, Snapshot.from_dict(raw), evidence, only_res)['outcomes']
    b = reconcile(parsed, tmap, Snapshot.from_dict(raw2), evidence, decisions)['outcomes']
    return {
        'resolution_audit': res_audit, 'new_student_audit': new_audit,
        'strict_import_with_passing_resolutions': sorted(f'{o.sheet}!{o.cell}' for o in a if o.status == 'IMPORT'),
        'strict_import_with_resolutions_and_eligible_students': sorted(f'{o.sheet}!{o.cell}' for o in b if o.status == 'IMPORT'),
        'strict_outcomes': {f'{o.sheet}!{o.cell}': o for o in b},
    }


def write(path, parsed, tmap, raw, plan, props, aud, deployed_label: str) -> dict:
    snap = Snapshot.from_dict(raw)
    T, ST = snap.teachers, snap.students
    L = {l['id']: l for l in snap.lessons}
    resolver = StudentResolver(snap)
    known_first = {ws(s['full_name']).split(' ')[0] for s in resolver.valid.values() if ws(s['full_name'])}
    tname = lambda t: T[t]['full_name'].strip() if t in T else ''
    entries = {ws(sp): e for e in tmap.data['teachers'] for sp in e['sheet_spellings']}
    res_by_cell = defaultdict(list)
    for r in aud['resolution_audit']:
        for c in r['cells']:
            res_by_cell[c].append(r)
    new_by_cell = defaultdict(list)
    for r in aud['new_student_audit']:
        for c in r['cells']:
            new_by_cell[c].append(r)
    strict_res = set(aud['strict_import_with_passing_resolutions'])
    strict_all = set(aud['strict_import_with_resolutions_and_eligible_students'])

    def lesson_desc(lid):
        l = L.get(lid)
        if not l:
            return lid
        return (f'{tname(l["teacher_id"])} {DAYS[l["day_of_week"]]} {hm(l["start_minute"])} {l["duration_minutes"]}m '
                f'[{" + ".join(ST[p["student_id"]]["full_name"] for p in l["parts"] if p["student_id"] in ST)}] ({lid[:8]})')

    rows, case_rows = [], defaultdict(list)
    for o in plan['outcomes']:
        if o['status'] != 'PENDING':
            continue
        cell = f'{o["sheet"]}!{o["cell"]}'
        e = entries.get(ws(o['teacher_raw']))
        cand_t = ([f'{tname(o["teacher_id"])} ({o["teacher_id"]})'] if o['teacher_id'] else
                  [f'{tname(c)} ({c})' for c in (e or {}).get('candidates', [])])
        text = ws(o['text_raw'].replace('*', ''))
        segs = segmentations(text)
        reading = segs[0] if len(segs) == 1 else preferred_reading(text, known_first)
        cand_s = []
        for part in (reading or ()):
            pool = sorted(set(resolver.by_exact.get(part, [])) | set(resolver.by_key.get(orthographic_key(part), [])))
            cand_s.append(f'{part}: ' + (', '.join(f'{ST[i]["full_name"]} ({i})' for i in pool) if pool else 'no record'))
        if reading is None:
            cand_s.append('cell can be read as: ' + ' / '.join(' + '.join(r) for r in segs))
        presence = '; '.join(f'{p["kind"]}: {lesson_desc(p["lesson_id"])}' for p in o.get('db_presence', []))
        related = '; '.join(lesson_desc(l) for l in o.get('related_lesson_ids', []))
        # safest proposed resolution
        proposals, changes = [], 'no'
        if cell in strict_res:
            proposals.append('approve the PASSING student match(es) below -> lesson can be imported as written')
        elif cell in strict_all:
            proposals.append('approve the passing match(es) and create the ELIGIBLE new student record(s) -> lesson can be imported as written')
        for r in res_by_cell.get(cell, []):
            proposals.append(f'student "{r["name"]}" -> {r["student_name"]} ({r["student_id"][:8]}) by {r["basis"]}: {r["verdict"]}'
                             + (f' ({"; ".join(r["fail_reasons"])})' if r['fail_reasons'] else ''))
        for r in new_by_cell.get(cell, []):
            proposals.append(f'new student "{r["full_name"]}": {r["verdict"]}' + (f' ({"; ".join(r["fail_reasons"])})' if r['fail_reasons'] else ''))
        if {'EXISTING_LESSON_DIFFERS', 'POSSIBLE_RESCHEDULE'} & set(o['reasons']):
            proposals.append('keep the existing appointment; if the workbook is right, an authorized edit of that lesson is required (changes existing data)')
            changes = 'only if you choose to change the existing appointment'
        if 'NO_TEACHER_IN_ROW' in o['reasons'] and o.get('db_presence'):
            proposals.append('interpretation only: the same lesson exists on ' + tname(o['db_presence'][0]['teacher_id']) + '; confirm the row belongs to that teacher')
        if 'TIME_ANNOTATION' in o['reasons']:
            proposals.append(f'column time {hm(o["start_minute"])} stays authoritative; confirm what "{ws(o["text_raw"])}" means (no move)')
        decision = ' | '.join(DECISIONS[r] for r in o['reasons'])
        row = [cell, o['sheet'], o['cell'], ws(o['teacher_raw']) or '(blank)', '; '.join(cand_t), ws(o['text_raw']), '\n'.join(cand_s),
               DAYS[o['day_of_week']], hm(o['start_minute']), o['start_minute'], o['duration_minutes'], o.get('duration_by_headers'),
               presence, related, ', '.join(o['reasons']), '\n'.join(proposals), changes, decision]
        rows.append(row)
        for title, members in CASES:
            if members & set(o['reasons']):
                case_rows[title].append(row)

    header = ['source', 'worksheet', 'cell', 'teacher (as written)', 'candidate teacher records (id)', 'students (as written)',
              'candidate student records (id) per name', 'weekday', 'start', 'start_minute', 'duration (merged)', 'duration by headers',
              'existing database matches', 'conflicting / possibly rescheduled lesson', 'why automatic import is blocked',
              'safest proposed resolution', 'changes existing data?', 'decision required from you']
    widths = [14, 9, 6, 18, 40, 24, 60, 9, 7, 6, 6, 6, 50, 50, 30, 70, 14, 90]
    # Booked lessons the deployed code cannot draw: under PR #29 every booked
    # lesson of a non-deleted teacher is drawn (shift group or Hourly group).
    not_displayed = [l for l in snap.booked() if l['teacher_id'] not in T or T[l['teacher_id']]['is_deleted']]
    wb = openpyxl.Workbook()
    s = wb.active
    s.title = 'Summary'
    for r in [('Pending source lessons', len(rows)),
              (f'Booked lessons not drawn by the deployed code ({deployed_label})', len(not_displayed)),
              ('Student matches proposed (name + Admin)', sum(1 for r in aud['resolution_audit'] if r['basis'] == 'NAME_AND_RESPONSIBLE_ADMIN')),
              ('  of which PASS the strict audit', sum(1 for r in aud['resolution_audit'] if r['verdict'] == 'PASS')),
              ('First-name-only single-record cases (never auto-approved)', sum(1 for r in aud['resolution_audit'] if r['basis'] == 'SOLE_RECORD_NEEDS_CONFIRMATION')),
              ('New student records proposed', len(aud['new_student_audit'])),
              ('  of which ELIGIBLE under the strict rules', sum(1 for r in aud['new_student_audit'] if r['verdict'] == 'ELIGIBLE')),
              ('Lessons importable with PASSING matches only', len(aud['strict_import_with_passing_resolutions'])),
              ('Lessons importable with PASSING matches + ELIGIBLE new students', len(aud['strict_import_with_resolutions_and_eligible_students'])),
              ('', '')] + [(f'Case {t}', len(case_rows[t])) for t, _ in CASES] + [('Case 8 Exist but not displayed', len(not_displayed))]:
        s.append(list(r))
    s.column_dimensions['A'].width = 70
    _sheet(wb, 'All pending', header, rows, widths)
    for t, _ in CASES:
        _sheet(wb, t, header, case_rows[t], widths)
    _sheet(wb, '8 Exist not displayed', ['lesson', 'reason'],
           [[lesson_desc(l['id']), 'teacher row missing or soft-deleted'] for l in not_displayed], [90, 40])
    _sheet(wb, 'Audit - student matches', ['verdict', 'teacher', 'name as written', 'proposed record', 'student id', 'basis', 'fail reasons',
                                            'other candidates (id, admin)', 'cells'],
           [[r['verdict'], tname(r['teacher_id']), r['name'], r['student_name'], r['student_id'], r['basis'], '; '.join(r['fail_reasons']),
             ', '.join(f'{ST[c]["full_name"]} ({c[:8]}, admin {str(raw_admin(raw, c))[:8]})' for c in r['candidates'] if c != r['student_id']),
             ', '.join(r['cells'])] for r in aud['resolution_audit']], [8, 22, 20, 22, 38, 30, 60, 70, 30])
    _sheet(wb, 'Audit - new students', ['verdict', 'full name (as written)', 'responsible admin id', 'teachers', 'cells', 'fail reasons', 'proposed id'],
           [[r['verdict'], r['full_name'], r['supervisor_id'] or '', ', '.join(tname(t) for t in r['teachers']), ', '.join(r['cells']),
             '; '.join(r['fail_reasons']), r['proposed_id']] for r in aud['new_student_audit']], [9, 24, 38, 40, 40, 60, 38])
    _sheet(wb, 'DB lessons not in sheet', ['category', 'lesson', 'workbook cells (same teacher, day, student)'],
           [[l['category'], lesson_desc(l['id']), ', '.join(l['workbook_cells'])] for l in plan['db_only_lessons']], [22, 90, 40])
    wb.save(path)
    return {t: len(case_rows[t]) for t, _ in CASES} | {'pending': len(rows), '8 Exist not displayed': len(not_displayed)}


def raw_admin(raw, sid):
    for s in raw['students']:
        if s['id'] == sid:
            return s.get('supervisor_id')
    return None

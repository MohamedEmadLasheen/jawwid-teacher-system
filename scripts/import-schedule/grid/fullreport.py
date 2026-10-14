"""Source -> database -> interface reconciliation workbook (contains student
names: write it only under the git-ignored dry-run folder).

Interface visibility is computed from the persisted rows with the rendering
rules of each code version, so "in the database but not on the screen" is
separated from "not in the database":

  deployed (main before PR #29)  a lesson is drawn only for a teacher holding an
                                 active shift assignment, and only between
                                 08:00 and 24:00
  PR #29                         shift teachers as before, plus an Hourly group
                                 for every non-deleted teacher with a booked
                                 lesson or a schedule_hourly_roster row; the
                                 axis spans 00:00-24:00
"""
from __future__ import annotations

from collections import Counter, defaultdict

import openpyxl
from openpyxl.styles import Font, PatternFill

from .identity import Snapshot, StudentResolver, orthographic_key, preferred_reading, segmentations, ws
from .reconcile import DECISIONS, ROOT_CAUSES

DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
hm = lambda m: '' if m is None else f'{(m // 60) % 24:02d}:{m % 60:02d}' + (' (+1 day)' if m >= 1440 else '')


def visibility(snap: Snapshot, lesson: dict, hourly_roster: set = frozenset()) -> tuple[bool, bool]:
    """(drawn by the code before PR #29, drawn by the code deployed since
    2026-10-13 20:09 UTC). PR #29 was merged and deployed then."""
    t = snap.teachers.get(lesson['teacher_id'])
    if t is None or lesson['lifecycle_status'] not in ('trial', 'active'):
        return False, False
    on_shift = lesson['teacher_id'] in snap.roster_teacher_ids()
    before = on_shift and not t['is_deleted'] and lesson['start_minute'] + lesson['duration_minutes'] > 480
    now = not t['is_deleted']           # shift group, or Hourly group (it holds a booked lesson)
    return before, now


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
    return s


def write(path, parsed, tmap, raw, plan, props) -> dict:
    snap = Snapshot.from_dict(raw)
    T, ST = snap.teachers, snap.students
    lessons = {l['id']: l for l in snap.lessons}
    outcomes = plan['outcomes']
    roster = tmap.shift_roster_ids
    resolver = StudentResolver(snap)
    known_first = {ws(s['full_name']).split(' ')[0] for s in resolver.valid.values() if ws(s['full_name'])}
    prop_res = {(r['teacher_id'], r['name']): r for r in props['student_resolutions']}
    prop_new = {}
    for r in props['new_students']:
        for t in r['teachers']:
            prop_new[(t, r['full_name'])] = r
    sim_res = set(props['simulation']['import_if_resolutions_approved'])
    sim_all = set(props['simulation']['import_if_resolutions_and_new_students_approved'])
    tname = lambda tid: T[tid]['full_name'].strip() if tid in T else ''
    names = lambda ids: ' + '.join(ST[i]['full_name'] for i in ids if i in ST)
    imported_by_key = {(l['source_sheet'], l['source_cell']): l for l in snap.lessons if l.get('source_sheet')}

    # ---- lessons: three states ----------------------------------------
    lesson_rows, counts = [], Counter()
    for o in outcomes:
        cell = f'{o["sheet"]}!{o["cell"]}'
        lid = o.get('existing_lesson_id')
        if o['status'] == 'IMPORT' and not lid:
            got = imported_by_key.get((o['sheet'], o['source_key']))
            lid = got['id'] if got else None
        l = lessons.get(lid) if lid else None
        dep, pr = visibility(snap, l) if l else (False, False)
        in_db = 'YES' if l else ('PARTLY (see presence)' if o.get('db_presence') else 'NO')
        counts[(in_db == 'YES', dep, pr)] += 1
        prop = ''
        if cell in sim_res:
            prop = 'importable once the proposed student resolutions are approved'
        elif cell in sim_all:
            prop = 'importable once the proposed resolutions AND new student records are approved'
        lesson_rows.append([
            cell, DAYS[o['day_of_week']], ws(o['teacher_raw']), o['header_raw'], hm(o['start_minute']), o['duration_minutes'],
            ws(o['text_raw']), o['status'], ', '.join(o.get('root_causes', [])), ', '.join(o['reasons']),
            tname(o['teacher_id']), o['teacher_classification'] or ('hourly (identity unresolved)' if ws(o['teacher_raw']) else 'unknown'),
            names(l and [p['student_id'] for p in l['parts']] or o.get('student_ids') or []),
            in_db, lid or '', 'yes' if dep else 'no', 'yes' if pr else 'no',
            '; '.join(f'{p["kind"]}: lesson {p["lesson_id"][:8]} on {tname(p["teacher_id"])} ({p["duration_minutes"]}m)' for p in o.get('db_presence', [])),
            DECISIONS[o['reasons'][0]] if o['reasons'] else '', prop, ' | '.join(o['details']),
        ])

    # ---- students: every name occurrence -------------------------------
    student_rows = []
    status_count = Counter()
    for o in outcomes:
        tid = o['teacher_id']
        reading = None
        if o['status'] in ('ALREADY_PRESENT', 'IMPORT') and o.get('student_ids'):
            for sid in o['student_ids']:
                student_rows.append([ST[sid]['full_name'] if sid in ST else sid, f'{o["sheet"]}!{o["cell"]}', tname(tid),
                                     'RESOLVED', sid, o['student_basis'], '', ''])
                status_count['RESOLVED'] += 1
            continue
        segs = segmentations(ws(o['text_raw'].replace('*', '')))
        reading = segs[0] if len(segs) == 1 else preferred_reading(o['text_raw'].replace('*', ''), known_first)
        if reading is None:
            student_rows.append([ws(o['text_raw']), f'{o["sheet"]}!{o["cell"]}', tname(tid), 'CELL READING AMBIGUOUS', '', '',
                                 ' / '.join(' + '.join(r) for r in segs), ''])
            status_count['CELL READING AMBIGUOUS'] += 1
            continue
        for part in reading:
            got, basis, why = resolver._part(part, tid) if tid else (None, None, 'teacher unresolved')
            pool = sorted(set(resolver.by_exact.get(part, [])) | set(resolver.by_key.get(orthographic_key(part), [])))
            if got:
                st, sid, ev = 'RESOLVED (cell blocked by another reason)', got[0], basis
            elif not pool:
                st, sid, ev = 'NO RECORD', '', why or ''
            else:
                st, sid, ev = f'AMBIGUOUS ({len(pool)} records)', '', why or ''
            p = prop_res.get((tid, part)) or prop_new.get((tid, part))
            proposal = (f'resolve to {p["student_id"]} ({p["basis"]})' if p and 'basis' in p
                        else (f'create new student {p["proposed_id"]}' if p else ''))
            student_rows.append([part, f'{o["sheet"]}!{o["cell"]}', tname(tid), st, sid, ev,
                                 ', '.join(f'{ST[c]["full_name"]} ({c[:8]})' for c in pool), proposal])
            status_count[st.split(' (')[0]] += 1

    # ---- teachers -------------------------------------------------------
    hourly_ids = {r['teacher_id'] for r in props['hourly_roster']}
    booked = Counter(l['teacher_id'] for l in snap.booked())
    by_t = defaultdict(Counter)
    for o in outcomes:
        by_t[ws(o['teacher_raw'])][o['status']] += 1
    teacher_rows = []
    for e in tmap.data['teachers']:
        c = sum((by_t[ws(s)] for s in e['sheet_spellings']), Counter())
        tid = e.get('teacher_id')
        shift = tid in roster
        vis_dep = 'shift group' if shift else 'not shown (no shift assignment)'
        vis_pr = 'shift group' if shift else ('Hourly group' if tid and booked[tid] else ('not shown until on hourly roster' if tid else 'not placed (identity unresolved)'))
        vis_prop = 'shift group' if shift else ('Hourly group' if tid in hourly_ids else 'not placed (identity unresolved)')
        teacher_rows.append([' / '.join(e['sheet_spellings']), sum(c.values()), 'shift-based/part-time' if shift else 'hourly',
                             e['status'], tname(tid) if tid else '', tid or '', e.get('basis', ''), booked[tid] if tid else 0,
                             c['ALREADY_PRESENT'], c['IMPORT'], c['PENDING'], vis_dep, vis_pr, vis_prop,
                             e.get('decision_required') or e.get('evidence', '')])
    blank = by_t['']
    teacher_rows.append(['(blank teacher cell)', sum(blank.values()), 'unknown', 'UNRESOLVED', '', '', '', 0,
                         blank['ALREADY_PRESENT'], blank['IMPORT'], blank['PENDING'], '—', '—', '—', DECISIONS['NO_TEACHER_IN_ROW']])

    # ---- in the database, not on screen ------------------------------
    hidden = []
    for l in snap.booked():
        dep, pr = visibility(snap, l)
        if not dep:
            hidden.append([l['id'], tname(l['teacher_id']), DAYS[l['day_of_week']], hm(l['start_minute']), l['duration_minutes'],
                           names([p['student_id'] for p in l['parts']]), l.get('source_sheet') or '', l.get('source_cell') or '',
                           'teacher has no shift assignment' if l['teacher_id'] not in snap.roster_teacher_ids() else 'before 08:00',
                           'yes' if pr else 'no'])

    wb = openpyxl.Workbook()
    s = wb.active
    s.title = 'Summary'
    rc = Counter(c for o in outcomes if o['status'] == 'PENDING' for c in o.get('root_causes', [])[:1])
    for row in [('Source lesson cells', len(outcomes)),
                ('In database and correct (already present + imported)', sum(1 for o in outcomes if o['status'] in ('ALREADY_PRESENT', 'IMPORT'))),
                ('Pending', sum(1 for o in outcomes if o['status'] == 'PENDING')),
                ('Booked lessons hidden by the code before PR #29', len(hidden)),
                ('Booked lessons hidden by the code deployed now (PR #29)', sum(1 for h in hidden if h[-1] == 'no')),
                ('', ''), ('Pending by primary root cause', '')] + \
            [(dict((c, d) for c, d, _ in ROOT_CAUSES)[k], v) for k, v in rc.most_common()]:
        s.append(list(row))
    s.column_dimensions['A'].width = 80

    _sheet(wb, 'Lessons (1141)', ['source cell', 'day', 'teacher (sheet)', 'header', 'start', 'duration', 'cell text', 'outcome',
                                   'root causes', 'reasons', 'DB teacher', 'classification', 'students', 'in database',
                                   'lesson id', 'visible: before PR #29', 'visible: deployed now (PR #29)', 'database presence (other teacher / duration)',
                                   'decision required', 'proposal effect', 'details'], lesson_rows,
           [14, 10, 18, 7, 8, 6, 26, 14, 26, 30, 22, 14, 30, 10, 38, 8, 8, 40, 60, 40, 80])
    _sheet(wb, 'Students', ['name as written', 'source cell', 'teacher', 'status', 'student id', 'evidence / reason', 'candidate records', 'proposal'],
           student_rows, [22, 14, 22, 30, 38, 40, 60, 50])
    _sheet(wb, 'Teachers', ['sheet spellings', 'cells', 'business class', 'identity', 'DB teacher', 'teacher id', 'basis', 'booked now',
                            'already present', 'imported', 'pending', 'visible: before PR #29', 'visible: deployed now (PR #29)', 'visible: PR + hourly roster',
                            'evidence / decision required'], teacher_rows, [40, 6, 18, 12, 24, 38, 30, 8, 8, 8, 8, 26, 26, 26, 90])
    _sheet(wb, 'In DB, not on screen', ['lesson id', 'teacher', 'day', 'start', 'duration', 'students', 'source_sheet', 'source_cell',
                                        'why hidden before PR #29', 'visible now (PR #29 deployed)'], hidden, [38, 22, 10, 8, 6, 40, 10, 18, 30, 10])
    _sheet(wb, 'Missing from DB', ['source cell', 'day', 'teacher (sheet)', 'start', 'duration', 'cell text', 'root causes', 'decision required', 'proposal effect'],
           [[r[0], r[1], r[2], r[4], r[5], r[6], r[8], r[18], r[19]] for r in lesson_rows if r[7] == 'PENDING' and r[13] == 'NO'],
           [14, 10, 18, 8, 6, 26, 26, 60, 40])
    _sheet(wb, 'Partly in DB', ['source cell', 'teacher (sheet)', 'start', 'duration', 'cell text', 'database presence', 'decision required'],
           [[r[0], r[2], r[4], r[5], r[6], r[17], r[18]] for r in lesson_rows if r[13].startswith('PARTLY')], [14, 18, 8, 6, 26, 60, 60])
    _sheet(wb, 'Proposed - hourly roster', ['teacher', 'teacher id', 'basis', 'has booked lessons', 'source note'],
           [[r['teacher_name'], r['teacher_id'], r['basis'], r['has_booked_lessons'], r['source']] for r in props['hourly_roster']],
           [26, 38, 34, 10, 70])
    _sheet(wb, 'Proposed - student links', ['teacher', 'name as written', 'resolve to', 'student id', 'basis', 'candidates', 'cells'],
           [[tname(r['teacher_id']), r['name'], r['student_name'], r['student_id'], r['basis'],
             ', '.join(f'{ST[c]["full_name"]} ({c[:8]})' for c in r['candidates']), ', '.join(r['cells'])] for r in props['student_resolutions']],
           [22, 20, 22, 38, 30, 70, 40])
    _sheet(wb, 'Proposed - new students', ['full name (as written)', 'first name only', 'responsible admin id', 'teachers', 'cells', 'proposed id'],
           [[r['full_name'], 'yes' if len(r['full_name'].split()) == 1 else '', r['supervisor_id'] or '(cell colour not an admin)',
             ', '.join(tname(t) for t in r['teachers']), ', '.join(r['cells']), r['proposed_id']] for r in props['new_students']],
           [24, 8, 38, 40, 50, 38])
    _sheet(wb, 'Segmentation decisions', ['cell', 'text', 'possible readings'],
           [[r['cell'], r['text'], ' / '.join(' + '.join(x) for x in r['readings'])] for r in props['cells_needing_segmentation_decision']],
           [14, 30, 90])
    _sheet(wb, 'DB lessons not in sheet', ['category', 'lesson id', 'teacher', 'day', 'start', 'duration', 'students', 'workbook cells'],
           [[l['category'], l['id'], tname(l['teacher_id']), DAYS[l['day_of_week']], hm(l['start_minute']), l['duration_minutes'],
             names(l['student_ids']), ', '.join(l['workbook_cells'])] for l in plan['db_only_lessons']], [22, 38, 22, 10, 8, 6, 40, 40])
    wb.save(path)
    return {'lesson_states': {f'db={k[0]} deployed={k[1]} pr={k[2]}': v for k, v in counts.items()},
            'students': dict(status_count), 'hidden_deployed': len(hidden),
            'hidden_after_pr': sum(1 for h in hidden if h[-1] == 'no'), 'primary_root_causes': dict(rc)}

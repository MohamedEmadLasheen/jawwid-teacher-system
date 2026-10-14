"""Post-import verification against the PERSISTED database.

Compares the pre-import snapshot the plan was made from with a fresh one:

  A. every planned lesson exists exactly once under its provenance key, with
     exactly the source teacher, day, start, duration, status and students;
  B. every row that existed before is unchanged — lessons (all columns),
     participants, teachers, students, shift assignments and templates,
     teacher availability;
  C. the only differences are the planned inserts (row counts reconcile);
  D. every source cell has exactly one outcome and the totals add up;
  E. no pending/already-present cell gained a lesson under its key.
"""
from __future__ import annotations

from collections import Counter


def _by_id(rows):
    return {r['id']: r for r in rows}


def verify(pre: dict, post: dict, plan: dict) -> dict:
    problems: list[str] = []
    items = plan['items']
    outcomes = plan['outcomes']

    post_lessons = _by_id(post['lessons'])
    by_key = Counter((l['source_sheet'], l['source_cell']) for l in post['lessons'] if l['source_sheet'])
    key_to_lesson = {(l['source_sheet'], l['source_cell']): l for l in post['lessons'] if l['source_sheet']}

    # A. planned inserts, field by field
    imported = []
    for i in items:
        key = (i['source_sheet'], i['source_cell'])
        n = by_key[key]
        if n != 1:
            problems.append(f'A {key}: {n} lessons carry this provenance key (expected 1)')
            continue
        l = key_to_lesson[key]
        want = {'teacher_id': i['teacher_id'], 'original_teacher_id': i['teacher_id'], 'day_of_week': i['day_of_week'],
                'start_minute': i['start_minute'], 'duration_minutes': i['duration_minutes'],
                'end_minute': i['start_minute'] + i['duration_minutes'], 'lifecycle_status': 'active'}
        for k, v in want.items():
            if l[k] != v:
                problems.append(f'A {key}: {k} is {l[k]!r}, source says {v!r}')
        got_students = sorted(p['student_id'] for p in l['parts'])
        if got_students != sorted(i['student_ids']):
            problems.append(f'A {key}: participants {got_students} != planned {sorted(i["student_ids"])}')
        if l['id'] in _by_id(pre['lessons']):
            problems.append(f'A {key}: lesson {l["id"]} existed before the import')
        imported.append(l['id'])

    # B. nothing that existed before changed
    for table in ('lessons', 'teachers', 'students', 'shift_assignments', 'shift_templates', 'teacher_availability'):
        before, after = _by_id(pre[table]), _by_id(post[table])
        for rid, row in before.items():
            if rid not in after:
                problems.append(f'B {table} {rid}: row disappeared')
            else:
                # Compared on the columns the pre-import snapshot recorded, so a
                # later snapshot that reads more columns cannot read as a change.
                diff = sorted(k for k in row if row.get(k) != after[rid].get(k))
                if diff:
                    problems.append(f'B {table} {rid}: changed columns {diff}')
        if table != 'lessons':
            for rid in after.keys() - before.keys():
                problems.append(f'B {table} {rid}: unexpected new row')
    new_lessons = set(post_lessons) - set(_by_id(pre['lessons']))
    if new_lessons != set(imported):
        problems.append(f'C lessons added outside the plan: {sorted(new_lessons - set(imported))}')

    # C. row counts reconcile exactly
    pc, qc = pre['counts'], post['counts']
    expect = dict(pc)
    expect['lessons'] = pc['lessons'] + len(items)
    expect['lesson_participants'] = pc['lesson_participants'] + sum(len(i['student_ids']) for i in items)
    for k, v in expect.items():
        if qc[k] != v:
            problems.append(f'C count {k}: {qc[k]} (expected {v})')

    # D/E. every source cell accounted for exactly once
    status = Counter(o['status'] for o in outcomes)
    if sum(status.values()) != plan['source_lesson_cells']:
        problems.append(f'D outcomes {sum(status.values())} != source lesson cells {plan["source_lesson_cells"]}')
    cells = Counter((o['sheet'], o['cell']) for o in outcomes)
    if any(n != 1 for n in cells.values()):
        problems.append('D a source cell has more than one outcome')
    planned_keys = {(i['source_sheet'], i['source_cell']) for i in items}
    for o in outcomes:
        key = (o['sheet'], o['source_key'])
        if o['status'] == 'IMPORT' and key not in planned_keys:
            problems.append(f'D {key}: IMPORT outcome missing from the plan')
        if o['status'] in ('PENDING', 'REJECTED') and by_key[key]:
            problems.append(f'E {key}: a pending cell has a lesson')
        if o['status'] == 'ALREADY_PRESENT':
            lid = o['existing_lesson_id']
            if lid not in post_lessons or post_lessons[lid]['lifecycle_status'] not in ('trial', 'active'):
                problems.append(f'E {key}: existing lesson {lid} is no longer booked')

    return {
        'ok': not problems,
        'problems': problems,
        'imported_lesson_ids': imported,
        'final_status_counts': dict(status),
        'imported_and_verified': len(imported) if not problems else None,
    }

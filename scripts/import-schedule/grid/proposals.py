"""Proposed data changes that need the owner's authorization. Never writes.

Three kinds, each a record-level list plus an in-memory simulation of what
approving it would add to the schedule:

  hourly_roster        confirmed hourly teachers to record in
                       schedule_hourly_roster (migration 026), so they appear in
                       the Hourly group even before a lesson is booked
  student_resolutions  ambiguous names where exactly ONE same-named record also
                       has the responsible Admin the workbook colours the cell
                       with — a second, recorded attribute, not name similarity
  new_students         names with no Teacher System record at all, to be
                       created (name exactly as written, responsible Admin from
                       the cell colour) — only from cells whose reading is
                       unambiguous and that carry no note or time annotation

Nothing here is applied. An approved resolution is copied into
student_identity_decisions.json; approved roster rows / new students are
written by a separately authorized step.
"""
from __future__ import annotations

import copy
import uuid
from collections import Counter

from .identity import (Snapshot, StudentResolver, orthographic_key, is_malformed_student_name, preferred_reading,
                       segmentations, ws)
from .reconcile import reconcile

# Supervisor colour families observed in the workbook (migration 006 seeds the
# base colours; the shades are the same families, see import_schedule.py).
# Keyed by supervisors.name so the ids come from the database, not from here.
COLOUR_FAMILIES = {
    'Dina': ['E06666', 'F4CCCC'],
    'Zainab': ['F9CB9C'],
    'Rehab': ['C9DAF8', 'CFE2F3', '9FC5E8'],
    'Asmaa': ['93C47D', '6AA84F', '38761D'],
}
NEW_STUDENT_NAMESPACE = uuid.UUID('6f1d1a52-6c1e-4f53-9d3a-2d0f5b9c1e01')


def colour_to_admin(supervisors: list) -> dict:
    by_name = {ws(s['name']): s['id'] for s in supervisors}
    out = {}
    for name, shades in COLOUR_FAMILIES.items():
        if name in by_name:
            for hexcode in shades:
                out[hexcode] = by_name[name]
    return out


def _admin_for(fill, colours):
    return colours.get((fill or '')[-6:].upper())


def build(parsed, tmap, raw: dict, evidence: dict, decisions: dict, outcomes) -> dict:
    snap = Snapshot.from_dict(raw)
    resolver = StudentResolver(snap, decisions)
    colours = colour_to_admin(raw.get('supervisors', []))
    admin_of = {s['id']: s.get('supervisor_id') for s in raw['students']}
    roster = tmap.shift_roster_ids
    booked_teachers = {l['teacher_id'] for l in snap.booked()}

    # 1. Hourly roster membership
    hourly_roster = []
    for e in tmap.data['teachers']:
        tid = e.get('teacher_id')
        if e['status'] == 'CONFIRMED' and tid not in roster:
            hourly_roster.append({'teacher_id': tid, 'teacher_name': snap.teachers[tid]['full_name'].strip(),
                                  'sheet_spellings': e['sheet_spellings'], 'basis': e['basis'],
                                  'has_booked_lessons': tid in booked_teachers,
                                  'source': f'operations workbook {parsed.short_sha}; teacher_identity_map basis {e["basis"]}'})

    pending = [o for o in outcomes if o.status == 'PENDING']

    # 2. Ambiguous names singled out by name + responsible Admin
    proposed: dict = {}
    conflicts = set()
    for o in pending:
        if not o.teacher_id or 'STUDENT_AMBIGUOUS' not in o.reasons:
            continue
        admin = _admin_for(o.fill, colours)
        if not admin:
            continue
        for seg in segmentations(ws(o.text_raw.replace('*', ''))):
            for part in seg:
                got, _, _ = resolver._part(part, o.teacher_id)
                if got is not None:
                    continue
                pool = sorted(set(resolver.by_exact.get(part, [])) | set(resolver.by_key.get(orthographic_key(part), [])))
                if len(pool) < 2:
                    continue
                match = [i for i in pool if admin_of.get(i) == admin]
                if len(match) != 1:
                    continue
                key = (o.teacher_id, part)
                if key in proposed and proposed[key]['student_id'] != match[0]:
                    conflicts.add(key)
                proposed.setdefault(key, {'teacher_id': o.teacher_id, 'name': part, 'student_id': match[0],
                                          'student_name': snap.students[match[0]]['full_name'],
                                          'basis': 'NAME_AND_RESPONSIBLE_ADMIN', 'supervisor_id': admin,
                                          'candidates': pool, 'cells': []})
                cell = f'{o.sheet}!{o.cell}'
                if cell not in proposed[key]['cells']:
                    proposed[key]['cells'].append(cell)
    # 2b. A bare first name whose ONLY record was never taught by this teacher:
    # one candidate, but a first name alone is not proof — confirm-only.
    for o in pending:
        if not o.teacher_id or 'STUDENT_UNCERTAIN' not in o.reasons:
            continue
        for seg in segmentations(ws(o.text_raw.replace('*', ''))):
            for part in seg:
                if resolver._part(part, o.teacher_id)[0] is not None:
                    continue
                exact = resolver.by_exact.get(part, [])
                if len(exact) == 1 and len(resolver.by_key.get(orthographic_key(part), [])) == 1 and (o.teacher_id, part) not in proposed:
                    proposed[(o.teacher_id, part)] = {
                        'teacher_id': o.teacher_id, 'name': part, 'student_id': exact[0],
                        'student_name': snap.students[exact[0]]['full_name'], 'basis': 'SOLE_RECORD_NEEDS_CONFIRMATION',
                        'supervisor_id': admin_of.get(exact[0]), 'candidates': exact, 'cells': [f'{o.sheet}!{o.cell}']}
    student_resolutions = [v for k, v in proposed.items() if k not in conflicts]

    # 3. New student records for names with no record at all
    new_students: dict = {}
    needs_segmentation = []
    known_first = {ws(s['full_name']).split(' ')[0] for s in resolver.valid.values() if ws(s['full_name'])}
    for o in pending:
        if not o.teacher_id or 'STUDENT_MISSING' not in o.reasons:
            continue
        if {'CELL_NOTE', 'TIME_ANNOTATION'} & set(o.reasons):
            continue
        readings = segmentations(ws(o.text_raw.replace('*', '')))
        reading = readings[0] if len(readings) == 1 else preferred_reading(o.text_raw.replace('*', ''), known_first)
        if reading is None:
            needs_segmentation.append({'cell': f'{o.sheet}!{o.cell}', 'text': ws(o.text_raw),
                                       'readings': [list(r) for r in readings]})
            continue
        admin = _admin_for(o.fill, colours)
        for part in reading:
            if resolver.by_exact.get(part) or resolver.by_key.get(orthographic_key(part)) or is_malformed_student_name(part):
                continue
            key = (part, admin)
            rec = new_students.setdefault(key, {
                'proposed_id': str(uuid.uuid5(NEW_STUDENT_NAMESPACE, f'{part}|{admin}')),
                'full_name': part, 'supervisor_id': admin, 'teachers': [], 'cells': []})
            if o.teacher_id not in rec['teachers']:
                rec['teachers'].append(o.teacher_id)
            rec['cells'].append(f'{o.sheet}!{o.cell}')
    new_student_list = list(new_students.values())
    same_name_twice = {n for n, c in Counter(r['full_name'] for r in new_student_list).items() if c > 1}

    # 4. Simulate approval, cumulatively: decisions -> + resolutions -> + new students
    def simulate(extra_decisions, extra_students):
        d = copy.deepcopy(decisions)
        d.setdefault('resolutions', []).extend(extra_decisions)
        r = copy.deepcopy(raw)
        r['students'].extend(extra_students)
        res = reconcile(parsed, tmap, Snapshot.from_dict(r), evidence, d)
        return {f'{o.sheet}!{o.cell}' for o in res['outcomes'] if o.status == 'IMPORT'}

    approve = lambda rows: [{'teacher_id': x['teacher_id'], 'name': x['name'], 'student_id': x['student_id'],
                             'approved_by': 'SIMULATION'} for x in rows]
    after_resolutions = simulate(approve(student_resolutions), [])
    creatable = [r for r in new_student_list if r['full_name'] not in same_name_twice]
    synthetic = [{'id': r['proposed_id'], 'full_name': r['full_name'], 'status': 'active', 'is_deleted': False,
                  'supervisor_id': r['supervisor_id'], 'created_at': 'proposed'} for r in creatable]
    new_decisions = [{'teacher_id': t, 'name': r['full_name'], 'student_id': r['proposed_id'], 'approved_by': 'SIMULATION'}
                     for r in creatable for t in r['teachers']]
    after_all = simulate(approve(student_resolutions) + new_decisions, synthetic)

    return {
        'hourly_roster': hourly_roster,
        'student_resolutions': student_resolutions,
        'student_resolution_conflicts': [{'teacher_id': k[0], 'name': k[1]} for k in conflicts],
        'new_students': new_student_list,
        'new_students_same_name_different_admin': sorted(same_name_twice),
        'cells_needing_segmentation_decision': needs_segmentation,
        'simulation': {
            'import_if_resolutions_approved': sorted(after_resolutions),
            'import_if_resolutions_and_new_students_approved': sorted(after_all),
        },
    }


def hourly_roster_sql(rows: list, plan_id: str) -> str:
    """INSERT-only, atomic; requires migration 026. Refuses a teacher that is
    deleted or holds an active shift assignment."""
    lines = [f'-- Hourly roster membership proposal ({len(rows)} teachers), from plan {plan_id}. Requires migration 026.',
             'DO $hourly_roster$', 'DECLARE v_n int := 0;', 'BEGIN',
             "  IF to_regclass('public.schedule_hourly_roster') IS NULL THEN RAISE EXCEPTION 'migration 026 is not applied'; END IF;"]
    for r in rows:
        tid = r['teacher_id']
        src = r['source'].replace("'", "''")
        lines += [
            f"  IF NOT EXISTS (SELECT 1 FROM public.teachers WHERE id = '{tid}'::uuid AND NOT is_deleted) THEN RAISE EXCEPTION 'teacher {tid} missing or deleted'; END IF;",
            f"  IF EXISTS (SELECT 1 FROM public.teacher_shift_assignments a JOIN public.shift_templates s ON s.id = a.shift_template_id "
            f"WHERE a.teacher_id = '{tid}'::uuid AND a.is_active AND s.is_active) THEN RAISE EXCEPTION 'teacher {tid} is on a shift roster'; END IF;",
            f"  INSERT INTO public.schedule_hourly_roster (teacher_id, source) VALUES ('{tid}'::uuid, '{src}') ON CONFLICT (teacher_id) DO NOTHING;",
            '  v_n := v_n + 1;',
        ]
    lines += [f"  RAISE NOTICE 'hourly roster: % teachers checked', v_n;", 'END', '$hourly_roster$;', '']
    return '\n'.join(lines)

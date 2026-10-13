#!/usr/bin/env python3
"""Operations schedule workbook -> Teacher System lessons. See grid/README.md.

  plan    read-only: parse, validate, reconcile, write the dry-run reports and
          the exact SQL the import would run
  apply   run a reviewed plan's SQL (one atomic INSERT-only block), then verify
  verify  re-snapshot the database and prove the plan landed exactly
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from grid import db as dbmod                       # noqa: E402
from grid.identity import Snapshot, TeacherMap, teacher_evidence  # noqa: E402
from grid.reconcile import reconcile               # noqa: E402
from grid.report import (classification_markdown, summary_markdown,  # noqa: E402
                         teacher_classification, write_xlsx)
from grid.sqlgen import generate_sql, plan_items   # noqa: E402
from grid.verify import verify                     # noqa: E402
from grid.workbook import parse_workbook           # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_MAP = os.path.join(HERE, 'grid', 'teacher_identity_map.json')


def sha256_file(path: str) -> str:
    with open(path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def write_private(path: str, content: str | bytes):
    mode = 'wb' if isinstance(content, bytes) else 'w'
    with open(path, mode, **({} if isinstance(content, bytes) else {'encoding': 'utf-8'})) as f:
        f.write(content)
    os.chmod(path, 0o600)


def target_from(args):
    if args.target == 'linked':
        if not args.workdir:
            sys.exit('--workdir (a directory linked with `supabase link`) is required for --target linked')
        return dbmod.LinkedTarget(args.workdir)
    return dbmod.PsqlTarget()


def snapshot_obj(raw: dict) -> Snapshot:
    return Snapshot.from_dict(raw)


def cmd_plan(args):
    os.makedirs(args.out, mode=0o700, exist_ok=True)
    parsed = parse_workbook(args.workbook)
    raw = dbmod.take_snapshot(target_from(args))
    snap = snapshot_obj(raw)
    tmap = TeacherMap.load(args.map)
    evidence = teacher_evidence(parsed.lessons, snap)
    result = reconcile(parsed, tmap, snap, evidence)
    items = plan_items(result['outcomes'])
    plan_id = hashlib.sha256('|'.join([parsed.sha256, raw['fingerprint'], sha256_file(args.map),
                                       json.dumps(items, sort_keys=True)]).encode()).hexdigest()[:16]
    sql = generate_sql(items, raw['fingerprint'], plan_id)
    classification = teacher_classification(parsed, tmap, snap, evidence, result['outcomes'])

    write_private(os.path.join(args.out, 'snapshot-pre.json'), json.dumps(raw, ensure_ascii=False))
    write_private(os.path.join(args.out, 'import.sql'), sql)
    plan = {
        'plan_id': plan_id, 'created_at': dt.datetime.now(dt.timezone.utc).isoformat(),
        'target': args.target, 'workbook': os.path.basename(args.workbook), 'workbook_sha256': parsed.sha256,
        'teacher_map_sha256': sha256_file(args.map), 'fingerprint': raw['fingerprint'],
        'import_sql_sha256': hashlib.sha256(sql.encode()).hexdigest(),
        'source_lesson_cells': len(parsed.lessons), 'non_lesson_cells': len(parsed.non_lessons),
        'map_problems': result['map_problems'], 'items': items,
        'outcomes': [o.to_dict() for o in result['outcomes']],
        'db_only_lessons': [{k: v for k, v in l.items() if k != 'parts'} | {'student_ids': [p['student_id'] for p in l['parts']]}
                            for l in result['db_only_lessons']],
        'teacher_classification': classification,
    }
    write_private(os.path.join(args.out, 'plan.json'), json.dumps(plan, ensure_ascii=False, indent=1))
    write_xlsx(os.path.join(args.out, 'reconciliation.xlsx'), parsed, snap, result, classification, items)
    os.chmod(os.path.join(args.out, 'reconciliation.xlsx'), 0o600)
    write_private(os.path.join(args.out, 'summary.md'), summary_markdown(parsed, result, classification, items, plan_id, raw['fingerprint']))
    write_private(os.path.join(args.out, 'teacher-classification.md'), classification_markdown(classification))
    counts = {s: sum(1 for o in result['outcomes'] if o.status == s) for s in ('ALREADY_PRESENT', 'IMPORT', 'PENDING', 'REJECTED')}
    print(json.dumps({'plan_id': plan_id, 'out': args.out, **counts, 'total': len(result['outcomes']),
                      'lessons_to_insert': len(items), 'map_problems': len(result['map_problems'])}, ensure_ascii=False))


def verify_backup(path: str):
    sums = os.path.join(path, 'SHA256SUMS')
    if not os.path.isfile(sums):
        sys.exit(f'backup {path} has no SHA256SUMS')
    proc = subprocess.run(['shasum', '-a', '256', '-c', 'SHA256SUMS'], cwd=path, capture_output=True, text=True)
    if proc.returncode != 0:
        sys.exit(f'backup checksum verification failed:\n{proc.stdout}{proc.stderr}')
    if not os.path.isfile(os.path.join(path, 'RESTORE.md')):
        sys.exit('backup has no RESTORE.md recording a verified restore')


def cmd_apply(args):
    plan_path = os.path.join(args.out, 'plan.json')
    sql_path = os.path.join(args.out, 'import.sql')
    plan = json.load(open(plan_path, encoding='utf-8'))
    if args.confirm != plan['plan_id']:
        sys.exit(f'--confirm must equal the reviewed plan id ({plan["plan_id"]})')
    if sha256_file(sql_path) != plan['import_sql_sha256']:
        sys.exit('import.sql does not match the plan (edited after review?)')
    if plan['target'] != args.target:
        sys.exit(f'plan was made against {plan["target"]}, not {args.target}')
    if args.target == 'linked':
        if not args.backup:
            sys.exit('--backup <dir> with a verified restore is required before writing to production')
        verify_backup(args.backup)
    if plan['map_problems']:
        sys.exit('the plan has teacher-map problems; fix them and re-plan')
    if not plan['items']:
        print('nothing to import')
        return
    out = target_from(args).execute_file(sql_path)
    write_private(os.path.join(args.out, 'apply-log.json'), json.dumps(
        {'plan_id': plan['plan_id'], 'applied_at': dt.datetime.now(dt.timezone.utc).isoformat(), 'target': args.target,
         'backup': args.backup, 'output': out}, ensure_ascii=False, indent=1))
    print(f'applied plan {plan["plan_id"]}')
    cmd_verify(args)


def cmd_verify(args):
    plan = json.load(open(os.path.join(args.out, 'plan.json'), encoding='utf-8'))
    pre = json.load(open(os.path.join(args.out, 'snapshot-pre.json'), encoding='utf-8'))
    post = dbmod.take_snapshot(target_from(args))
    write_private(os.path.join(args.out, 'snapshot-post.json'), json.dumps(post, ensure_ascii=False))
    result = verify(pre, post, plan)
    write_private(os.path.join(args.out, 'verification.json'), json.dumps(result, ensure_ascii=False, indent=1))
    print(json.dumps({k: v for k, v in result.items() if k != 'imported_lesson_ids'}, ensure_ascii=False, indent=1))
    if not result['ok']:
        sys.exit(2)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    for name in ('plan', 'apply', 'verify'):
        p = sub.add_parser(name)
        p.add_argument('--out', required=True, help='plan directory (keep it under scripts/import-schedule/dry-run/, which is git-ignored)')
        p.add_argument('--target', choices=['linked', 'psql'], required=True)
        p.add_argument('--workdir', help='supabase-linked directory for --target linked')
        if name == 'plan':
            p.add_argument('--workbook', required=True)
            p.add_argument('--map', default=DEFAULT_MAP)
        if name == 'apply':
            p.add_argument('--confirm', required=True, help='the plan id printed by `plan`')
            p.add_argument('--backup', help='verified backup directory (required for --target linked)')
    args = ap.parse_args()
    {'plan': cmd_plan, 'apply': cmd_apply, 'verify': cmd_verify}[args.cmd](args)


if __name__ == '__main__':
    main()

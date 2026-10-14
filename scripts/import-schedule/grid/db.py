"""Database access: read-only snapshots and the single controlled write.

Two targets share one interface:
  linked  the Teacher System production project, through the Supabase CLI's
          `db query --linked` (Management API, the operator's own CLI login —
          no database password is handled by this tool);
  psql    any Postgres reachable with psql + libpq environment variables
          (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE) — used for the
          disposable restore-verification and test databases.

Every read runs inside a READ ONLY transaction. The only write is
`execute_file`, which runs one generated import script.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess

# Booked-set fingerprint: computed identically at plan time and inside the
# import transaction, so a plan cannot be applied to a schedule that changed
# after it was reviewed.
FINGERPRINT_SQL = """
SELECT md5(coalesce(string_agg(
         l.id::text || ':' || l.teacher_id::text || ':' || l.day_of_week || ':' || l.start_minute || ':' ||
         l.duration_minutes || ':' || l.lifecycle_status || ':' ||
         coalesce((SELECT string_agg(p.student_id::text, ',' ORDER BY p.student_id)
                     FROM public.lesson_participants p WHERE p.lesson_id = l.id), ''),
         '|' ORDER BY l.id), ''))
  FROM public.lessons l
 WHERE l.lifecycle_status IN ('trial', 'active')
""".strip()

SNAPSHOT_QUERIES = {
    'teachers': "SELECT id, full_name, teacher_type, status, is_deleted, created_at::text FROM public.teachers ORDER BY id",
    'students': "SELECT id, full_name, status, is_deleted, supervisor_id, created_at::text FROM public.students ORDER BY id",
    'supervisors': "SELECT id, name, color_hex, status FROM public.supervisors ORDER BY id",
    'lessons': """SELECT l.id, l.teacher_id, l.day_of_week, l.start_minute, l.duration_minutes, l.end_minute,
                         l.lifecycle_status, l.effective_from::text, l.effective_until::text, l.original_teacher_id,
                         l.same_day_since::text, l.same_time_since::text, l.timezone, l.course_id, l.branch_id,
                         l.created_by, l.notes, l.is_demo, l.source_sheet, l.source_cell,
                         l.created_at::text, l.updated_at::text,
                         coalesce((SELECT json_agg(json_build_object('id', p.id, 'student_id', p.student_id) ORDER BY p.student_id)
                                     FROM public.lesson_participants p WHERE p.lesson_id = l.id), '[]'::json) AS parts
                    FROM public.lessons l ORDER BY l.id""",
    'shift_assignments': """SELECT a.id, a.teacher_id, a.shift_template_id, a.day_of_week, a.is_active,
                                   t.name, t.start_minute, t.end_minute, t.is_active AS t_active, a.updated_at::text
                              FROM public.teacher_shift_assignments a
                              JOIN public.shift_templates t ON t.id = a.shift_template_id ORDER BY a.id""",
    'shift_templates': "SELECT id, name, start_minute, end_minute, is_active, updated_at::text FROM public.shift_templates ORDER BY id",
    'teacher_availability': "SELECT * FROM public.teacher_availability ORDER BY id",
    'counts': """SELECT (SELECT count(*) FROM public.lessons) AS lessons,
                        (SELECT count(*) FROM public.lesson_participants) AS lesson_participants,
                        (SELECT count(*) FROM public.teachers) AS teachers,
                        (SELECT count(*) FROM public.students) AS students,
                        (SELECT count(*) FROM public.teacher_shift_assignments) AS teacher_shift_assignments,
                        (SELECT count(*) FROM public.shift_templates) AS shift_templates,
                        (SELECT count(*) FROM public.teacher_availability) AS teacher_availability,
                        (SELECT count(*) FROM public.lesson_exceptions) AS lesson_exceptions,
                        (SELECT count(*) FROM public.student_teacher_assignments) AS student_teacher_assignments""",
    'fingerprint': f"SELECT ({FINGERPRINT_SQL}) AS fingerprint",
}


class DbError(RuntimeError):
    pass


def _as_json_rows(sql: str) -> str:
    # jsonb, not json: json_agg separates elements with newlines, jsonb's text
    # form is one line, so psql's unaligned output is exactly one value.
    return f"SELECT coalesce(jsonb_agg(t), '[]'::jsonb) AS rows FROM ({sql}) t"


class LinkedTarget:
    name = 'linked'

    def __init__(self, workdir: str):
        if not shutil.which('supabase'):
            raise DbError('the supabase CLI is not installed')
        self.workdir = workdir

    def _run(self, args: list[str]) -> str:
        proc = subprocess.run(['supabase', 'db', 'query', '--linked', '--workdir', self.workdir, '-o', 'json', *args],
                              capture_output=True, text=True)
        if proc.returncode != 0:
            raise DbError(proc.stderr.strip() or proc.stdout.strip())
        return proc.stdout

    def query(self, sql: str) -> list[dict]:
        out = json.loads(self._run([f'SET TRANSACTION READ ONLY; {_as_json_rows(sql)}']))
        rows = out.get('rows', out) if isinstance(out, dict) else out
        value = rows[0]['rows']
        return json.loads(value) if isinstance(value, str) else value

    def execute_file(self, path: str) -> str:
        # Absolute: the CLI resolves a relative -f against --workdir.
        return self._run(['-f', os.path.abspath(path)])


class PsqlTarget:
    name = 'psql'

    def __init__(self, psql: str | None = None, env: dict | None = None):
        self.psql = psql or shutil.which('psql') or '/opt/homebrew/opt/libpq/bin/psql'
        self.env = {**os.environ, **(env or {})}

    def _run(self, args: list[str], stdin: str | None = None) -> str:
        proc = subprocess.run([self.psql, '-X', '-q', '-v', 'ON_ERROR_STOP=1', *args],
                              input=stdin, capture_output=True, text=True, env=self.env)
        if proc.returncode != 0:
            raise DbError(proc.stderr.strip() or proc.stdout.strip())
        return proc.stdout

    def query(self, sql: str) -> list[dict]:
        out = self._run(['-A', '-t'], stdin=f'BEGIN READ ONLY;\n{_as_json_rows(sql)};\nCOMMIT;\n')
        lines = [ln for ln in out.splitlines() if ln.strip()]
        return json.loads(lines[-1])

    def execute(self, sql: str) -> str:
        return self._run([], stdin=sql)

    def execute_file(self, path: str) -> str:
        return self._run(['-1', '-f', path])


def take_snapshot(target) -> dict:
    snap = {name: target.query(sql) for name, sql in SNAPSHOT_QUERIES.items()}
    snap['counts'] = snap['counts'][0]
    snap['fingerprint'] = snap['fingerprint'][0]['fingerprint']
    return snap

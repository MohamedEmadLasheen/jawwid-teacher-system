"""The generated import against a real Postgres built from this repository's
migrations (001-020, 024, 025 — see README). Skipped unless GRID_TEST_PGHOST
is set. Refuses any database that is not local or holds non-test teachers.

  GRID_TEST_PGHOST=127.0.0.1 GRID_TEST_PGPORT=... GRID_TEST_PGUSER=postgres \
  GRID_TEST_PGPASSWORD=... GRID_TEST_PGDATABASE=postgres \
  python3 -m unittest discover -s scripts/import-schedule -p 'test_*.py' -t scripts/import-schedule
"""
import os
import unittest
import uuid

from grid.db import DbError, PsqlTarget, take_snapshot
from grid.sqlgen import generate_sql
from grid.verify import verify

ENV = {k[len('GRID_TEST_'):]: v for k, v in os.environ.items() if k.startswith('GRID_TEST_PG')}


@unittest.skipUnless(ENV.get('PGHOST'), 'GRID_TEST_PGHOST not set')
class GeneratedImport(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if ENV['PGHOST'] not in ('127.0.0.1', 'localhost', '::1'):
            raise unittest.SkipTest('refusing a non-local database')
        cls.db = PsqlTarget(env=ENV)
        foreign = cls.db.query("SELECT count(*) AS n FROM public.teachers WHERE full_name NOT LIKE 'TEST %'")[0]['n']
        if foreign:
            raise RuntimeError('refusing: this database holds non-test teachers')

    def setUp(self):
        self.db.execute("TRUNCATE public.lessons CASCADE; DELETE FROM public.teacher_shift_assignments; "
                        "DELETE FROM public.shift_templates WHERE name LIKE 'TEST %'; "
                        "DELETE FROM public.students WHERE full_name LIKE 'TEST %'; DELETE FROM public.teachers WHERE full_name LIKE 'TEST %';")
        self.t1, self.t2 = self.teacher('TEST teacher one'), self.teacher('TEST teacher two')
        self.s1, self.s2, self.s3 = (self.student(f'TEST student {i}') for i in range(3))
        tpl = str(uuid.uuid4())
        self.db.execute(f"INSERT INTO public.shift_templates (id, name, start_minute, end_minute) VALUES ('{tpl}', 'TEST Full-time', 720, 1140);"
                        f"INSERT INTO public.teacher_shift_assignments (teacher_id, shift_template_id, day_of_week) "
                        f"SELECT '{self.t1}', '{tpl}', d FROM generate_series(0, 6) d;")
        # An existing appointment that must never change.
        self.existing = self.lesson(self.t1, 0, 900, 30, [self.s1])

    def teacher(self, name):
        i = str(uuid.uuid4())
        self.db.execute(f"INSERT INTO public.teachers (id, full_name) VALUES ('{i}', '{name}');")
        return i

    def student(self, name):
        i = str(uuid.uuid4())
        self.db.execute(f"INSERT INTO public.students (id, full_name) VALUES ('{i}', '{name}');")
        return i

    def lesson(self, teacher, day, start, dur, students, status='active'):
        i = str(uuid.uuid4())
        self.db.execute(f"INSERT INTO public.lessons (id, teacher_id, day_of_week, start_minute, duration_minutes, lifecycle_status) "
                        f"VALUES ('{i}', '{teacher}', {day}, {start}, {dur}, '{status}');"
                        + ''.join(f"INSERT INTO public.lesson_participants (lesson_id, student_id) VALUES ('{i}', '{s}');" for s in students))
        return i

    def item(self, cell, teacher, day, start, dur, students, sheet='سبت'):
        return {'source_sheet': sheet, 'source_cell': f'{cell}@aaaaaaaaaaaa', 'teacher_id': teacher, 'day_of_week': day,
                'start_minute': start, 'duration_minutes': dur, 'student_ids': sorted(students)}

    def apply(self, items, fingerprint=None):
        snap = take_snapshot(self.db)
        sql = generate_sql(items, fingerprint or snap['fingerprint'], 'testplan')
        path = os.path.join(os.environ.get('TMPDIR', '/tmp'), f'grid-test-{uuid.uuid4()}.sql')
        with open(path, 'w', encoding='utf-8') as f:
            f.write(sql)
        try:
            self.db.execute_file(path)
        finally:
            os.remove(path)
        return snap

    def count(self, table):
        return self.db.query(f'SELECT count(*) AS n FROM public.{table}')[0]['n']

    # --- exact values ---------------------------------------------------
    def test_nonstandard_early_midnight_and_last_slot_times_persist_exactly(self):
        items = [self.item('C3', self.t2, 6, 14 * 60 + 10, 50, [self.s2]),   # 14:10, 50 min
                 self.item('D3', self.t2, 6, 5 * 60 + 45, 30, [self.s3]),    # 05:45
                 self.item('E3', self.t2, 1, 0, 30, [self.s2]),              # 00:00 at the start of a day
                 self.item('F3', self.t2, 1, 23 * 60 + 30, 30, [self.s3])]   # 23:30-24:00
        pre = self.apply(items)
        rows = {r['source_cell']: r for r in self.db.query(
            "SELECT source_cell, day_of_week, start_minute, duration_minutes, end_minute, lifecycle_status, original_teacher_id "
            "FROM public.lessons WHERE source_cell LIKE '%@aaaaaaaaaaaa'")}
        self.assertEqual({k: (v['day_of_week'], v['start_minute'], v['duration_minutes'], v['end_minute']) for k, v in rows.items()},
                         {'C3@aaaaaaaaaaaa': (6, 850, 50, 900), 'D3@aaaaaaaaaaaa': (6, 345, 30, 375),
                          'E3@aaaaaaaaaaaa': (1, 0, 30, 30), 'F3@aaaaaaaaaaaa': (1, 1410, 30, 1440)})
        self.assertTrue(all(r['lifecycle_status'] == 'active' and r['original_teacher_id'] == self.t2 for r in rows.values()))
        report = verify(pre, take_snapshot(self.db), {'items': items, 'outcomes': [], 'source_lesson_cells': 0})
        self.assertTrue(report['ok'], report['problems'])

    def test_the_data_model_cannot_hold_a_lesson_starting_at_24_00(self):
        with self.assertRaises(DbError):
            self.lesson(self.t2, 6, 1440, 30, [self.s2])

    # --- atomicity --------------------------------------------------------
    def test_a_failing_item_leaves_no_partial_batch(self):
        before = (self.count('lessons'), self.count('lesson_participants'))
        snap = take_snapshot(self.db)
        self.db.execute(f"UPDATE public.students SET is_deleted = true WHERE id = '{self.s3}';")   # after planning
        items = [self.item('C3', self.t2, 6, 600, 30, [self.s2]), self.item('D3', self.t2, 6, 660, 30, [self.s3])]
        with self.assertRaises(DbError):
            self.apply(items, snap['fingerprint'])
        self.assertEqual((self.count('lessons'), self.count('lesson_participants')), before)

    def test_an_overlap_caught_by_the_constraints_rolls_back_everything(self):
        before = self.count('lessons')
        items = [self.item('C3', self.t2, 6, 600, 30, [self.s2]), self.item('D3', self.t2, 6, 600, 60, [self.s3])]
        with self.assertRaises(DbError) as ctx:
            self.apply(items)
        self.assertIn('excl', str(ctx.exception))
        self.assertEqual(self.count('lessons'), before)

    def test_a_schedule_changed_after_planning_is_refused(self):
        snap = take_snapshot(self.db)
        self.lesson(self.t2, 2, 600, 30, [self.s3])                  # someone books after the plan
        before = self.count('lessons')
        with self.assertRaises(DbError) as ctx:
            self.apply([self.item('C3', self.t2, 6, 600, 30, [self.s2])], snap['fingerprint'])
        self.assertIn('changed since the plan', str(ctx.exception))
        self.assertEqual(self.count('lessons'), before)

    # --- idempotency ------------------------------------------------------
    def test_repeating_an_import_creates_nothing(self):
        items = [self.item('C3', self.t2, 6, 600, 30, [self.s2])]
        self.apply(items)
        after_first = (self.count('lessons'), self.count('lesson_participants'))
        with self.assertRaises(DbError) as ctx:
            self.apply(items)   # fresh fingerprint, so the provenance guard is what stops it
        self.assertIn('already imported', str(ctx.exception))
        self.assertEqual((self.count('lessons'), self.count('lesson_participants')), after_first)

    def test_provenance_is_immutable_once_written(self):
        self.apply([self.item('C3', self.t2, 6, 600, 30, [self.s2])])
        with self.assertRaises(DbError):
            self.db.execute("UPDATE public.lessons SET source_cell = 'Z9@aaaaaaaaaaaa' WHERE source_cell = 'C3@aaaaaaaaaaaa';")

    # --- regression: existing data ---------------------------------------
    def test_verify_proves_existing_appointments_and_shifts_untouched(self):
        items = [self.item('C3', self.t2, 6, 600, 30, [self.s2])]
        pre = self.apply(items)
        plan = {'items': items, 'outcomes': [], 'source_lesson_cells': 0}
        self.assertTrue(verify(pre, take_snapshot(self.db), plan)['ok'])
        self.db.execute(f"UPDATE public.lessons SET start_minute = 930 WHERE id = '{self.existing}';"
                        "UPDATE public.teacher_shift_assignments SET is_active = false WHERE day_of_week = 3;")
        problems = verify(pre, take_snapshot(self.db), plan)['problems']
        self.assertTrue(any(self.existing in p and 'start_minute' in p for p in problems))
        self.assertTrue(any(p.startswith('B shift_assignments') for p in problems))


if __name__ == '__main__':
    unittest.main()

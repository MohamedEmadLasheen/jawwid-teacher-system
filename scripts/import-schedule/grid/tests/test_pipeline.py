"""Parser, identity and reconciliation rules — no database.

Run: python3 -m unittest discover -s scripts/import-schedule -p 'test_*.py' -t scripts/import-schedule
"""
import datetime as dt
import os
import tempfile
import unittest

from grid.identity import Snapshot, StudentResolver, TeacherMap, segmentations, teacher_evidence
from grid.reconcile import reconcile
from grid.sqlgen import plan_items
from grid.workbook import WorkbookError, parse_workbook, reconstruct_header_minutes

from .fixtures import (SnapshotBuilder, col_for, confirmed, make_workbook, standard_headers, teacher_map,
                       twelve_hour, unresolved)


class Case(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.b = SnapshotBuilder()

    def tearDown(self):
        self.tmp.cleanup()

    def run_pipeline(self, content, entries, roster=(), headers=None):
        path = make_workbook(os.path.join(self.tmp.name, 'wb.xlsx'), content, headers)
        parsed = parse_workbook(path)
        snap = Snapshot.from_dict(self.b.snapshot())
        tmap = TeacherMap(teacher_map(entries, roster))
        result = reconcile(parsed, tmap, snap, teacher_evidence(parsed.lessons, snap))
        return parsed, result, {(o.sheet, o.cell): o for o in result['outcomes']}


class HeaderInterpretation(Case):
    def test_am_pm_reconstructed_from_column_order(self):
        cols = [(i, h) for i, h in enumerate(standard_headers(5 * 60), start=3)]
        got = [h['minute'] for h in reconstruct_header_minutes(cols)]
        self.assertEqual(got[0], 300)                      # 05:00 is AM: it precedes 08:00 and noon
        self.assertIn(720, got)                            # "12:00" after 11:30 AM is noon
        self.assertEqual(got[-2:], [1440, 1470])           # "12:00"/"12:30" after 11:30 PM are past midnight
        self.assertEqual(got, sorted(got))

    def test_non_increasing_header_rejects_the_workbook(self):
        with self.assertRaises(WorkbookError):
            reconstruct_header_minutes([(3, dt.time(9, 0)), (4, dt.time(9, 0))])


class TimeCases(Case):
    def setUp(self):
        super().setUp()
        self.t = self.b.teacher('معلم تجربة')
        self.s = self.b.student('طالب اول تجربة')
        self.entries = [confirmed(['معلم تجربة'], self.t)]

    def test_lesson_before_0800_keeps_its_exact_time(self):
        headers = {'الاثنين': standard_headers(7 * 60 + 30)}
        _, _, out = self.run_pipeline({'الاثنين': [('معلم تجربة', {'C': 'طالب اول تجربة'})]}, self.entries, headers=headers)
        o = out[('الاثنين', 'C3')]
        self.assertEqual((o.status, o.start_minute, o.duration_minutes), ('IMPORT', 450, 30))

    def test_lesson_at_start_of_day_00_00(self):
        headers = {'الاحد': [twelve_hour(m) for m in range(0, 24 * 60, 30)]}  # first column "12:00" = midnight AM
        _, _, out = self.run_pipeline({'الاحد': [('معلم تجربة', {'C': 'طالب اول تجربة'})]}, self.entries, headers=headers)
        self.assertEqual((out[('الاحد', 'C3')].status, out[('الاحد', 'C3')].start_minute), ('IMPORT', 0))

    def test_last_slot_of_the_day_ends_exactly_at_midnight(self):
        cell = col_for(23 * 60 + 30)
        _, _, out = self.run_pipeline({'الاحد': [('معلم تجربة', {cell: 'طالب اول تجربة'})]}, self.entries)
        o = out[('الاحد', f'{cell}3')]
        self.assertEqual((o.status, o.start_minute, o.start_minute + o.duration_minutes), ('IMPORT', 1410, 1440))

    def test_header_after_midnight_is_pending_never_folded_back(self):
        cell = col_for(24 * 60)
        _, _, out = self.run_pipeline({'الاحد': [('معلم تجربة', {cell: 'طالب اول تجربة'})]}, self.entries)
        o = out[('الاحد', f'{cell}3')]
        self.assertEqual(o.status, 'PENDING')
        self.assertIn('NEXT_DAY_HEADER', o.reasons)
        self.assertEqual(o.start_minute, 1440)             # preserved, not rewritten to 0

    def test_block_crossing_midnight_is_pending(self):
        cell = col_for(23 * 60 + 30)
        _, _, out = self.run_pipeline({'الاحد': [('معلم تجربة', {cell: ('طالب اول تجربة', 2)})]}, self.entries)
        self.assertIn('NEXT_DAY_HEADER', out[('الاحد', f'{cell}3')].reasons)

    def test_time_annotation_preserves_both_values_and_blocks(self):
        cell = col_for(15 * 60)
        _, _, out = self.run_pipeline({'الاحد': [('معلم تجربة', {cell: 'طالب اول تجربة 3:20'})]}, self.entries)
        o = out[('الاحد', f'{cell}3')]
        self.assertEqual((o.status, o.start_minute), ('PENDING', 900))
        self.assertIn('TIME_ANNOTATION', o.reasons)
        self.assertTrue(any('15:00' in d and '3:20' in d for d in o.details))

    def test_exact_nonstandard_start_matches_existing_lesson(self):
        # An existing 14:10 lesson is never confused with the 14:00 column.
        self.b.lesson(self.t, 0, 14 * 60 + 10, 50, [self.s])
        cell = col_for(14 * 60)
        _, _, out = self.run_pipeline({'الاحد': [('معلم تجربة', {cell: 'طالب اول تجربة'})]}, self.entries)
        o = out[('الاحد', f'{cell}3')]
        self.assertEqual(o.status, 'PENDING')
        self.assertIn('EXISTING_LESSON_DIFFERS', o.reasons)

    def test_header_gap_makes_duration_ambiguous(self):
        hdr = [dt.time(7, 0)] + standard_headers()          # 07:00 then 08:00: a 60-minute gap
        _, _, out = self.run_pipeline({'الاربعاء': [('معلم تجربة', {'C': 'طالب اول تجربة'})]}, self.entries, headers={'الاربعاء': hdr})
        self.assertIn('HEADER_GAP', out[('الاربعاء', 'C3')].reasons)


class Identity(Case):
    def test_teacher_with_several_possible_records_stays_pending(self):
        a, b = self.b.teacher('Fatma English'), self.b.teacher('Fatma English')
        self.b.student('طالب ثاني تجربة')
        _, _, out = self.run_pipeline({'سبت': [('فاطمه', {'C': 'طالب ثاني تجربة'})]}, [unresolved(['فاطمه'], [a, b])])
        o = out[('سبت', 'C3')]
        self.assertEqual((o.status, o.reasons[0], o.teacher_id), ('PENDING', 'TEACHER_UNRESOLVED', None))

    def test_history_basis_fails_revalidation_when_duplicate_also_has_history(self):
        t1, t2 = self.b.teacher('Dalia'), self.b.teacher('Ustatha Dalia')
        s = self.b.student('طالب ثالث تجربة')
        for start in (600, 660, 720):
            self.b.lesson(t1, 6, start, 30, [s], status='ended')
        self.b.lesson(t2, 6, 780, 30, [s], status='ended')
        content = {'سبت': [('داليا', {col_for(m): 'طالب ثالث تجربة' for m in (600, 660, 720, 780)})]}
        _, res, out = self.run_pipeline(content, [confirmed(['داليا'], t1, 'HISTORY_ESTABLISHED_OVER_DUPLICATE', [t1, t2])])
        self.assertTrue(res['map_problems'])
        self.assertTrue(all(o.status == 'PENDING' and o.reasons[0] == 'TEACHER_UNRESOLVED' for o in out.values()))

    def test_unmapped_spelling_is_pending(self):
        self.b.student('طالب رابع تجربة')
        _, _, out = self.run_pipeline({'سبت': [('معلم غير معروف', {'C': 'طالب رابع تجربة'})]}, [])
        self.assertEqual(out[('سبت', 'C3')].reasons, ['TEACHER_UNMAPPED'])

    def test_student_with_several_records_is_ambiguous(self):
        t = self.b.teacher('T')
        self.b.student('سارة احمد'); self.b.student('سارة احمد')
        _, _, out = self.run_pipeline({'سبت': [('ت', {'C': 'سارة احمد'})]}, [confirmed(['ت'], t)])
        self.assertIn('STUDENT_AMBIGUOUS', out[('سبت', 'C3')].reasons)

    def test_teacher_history_singles_out_one_of_several_records(self):
        t = self.b.teacher('T')
        s1 = self.b.student('سارة احمد'); self.b.student('سارة احمد')
        self.b.lesson(t, 0, 600, 30, [s1], status='ended')
        _, _, out = self.run_pipeline({'سبت': [('ت', {'C': 'سارة احمد'})]}, [confirmed(['ت'], t)])
        o = out[('سبت', 'C3')]
        self.assertEqual((o.status, o.student_ids, o.student_basis), ('IMPORT', [s1], 'HISTORY_DISAMBIGUATED'))

    def test_missing_student_is_pending_and_never_created(self):
        t = self.b.teacher('T')
        _, _, out = self.run_pipeline({'سبت': [('ت', {'C': 'طالب غير موجود'})]}, [confirmed(['ت'], t)])
        o = out[('سبت', 'C3')]
        self.assertEqual((o.status, o.reasons), ('PENDING', ['STUDENT_MISSING']))

    def test_malformed_student_record_is_not_an_identity(self):
        t = self.b.teacher('T')
        self.b.student('خديجه 4.10')
        _, _, out = self.run_pipeline({'سبت': [('ت', {'C': 'خديجه 4.10'})]}, [confirmed(['ت'], t)])
        self.assertEqual(out[('سبت', 'C3')].status, 'PENDING')

    def test_bare_first_name_without_history_is_uncertain(self):
        t = self.b.teacher('T')
        self.b.student('حمدان'); self.b.student('حمدان خالد')
        _, _, out = self.run_pipeline({'سبت': [('ت', {'C': 'حمدان'})]}, [confirmed(['ت'], t)])
        self.assertIn('STUDENT_UNCERTAIN', out[('سبت', 'C3')].reasons)

    def test_name_starting_with_waw_is_not_split_when_that_reading_fails(self):
        t = self.b.teacher('T')
        s = self.b.student('وسام علي')
        _, _, out = self.run_pipeline({'سبت': [('ت', {'C': 'وسام علي'})]}, [confirmed(['ت'], t)])
        self.assertEqual(out[('سبت', 'C3')].student_ids, [s])

    def test_group_cell_with_two_valid_readings_is_ambiguous(self):
        self.assertIn(('خالد', 'محمد وائل'), segmentations('خالد ومحمد وائل'))
        self.assertIn(('خالد', 'محمد', 'ائل'), segmentations('خالد ومحمد وائل'))


class ReconciliationCases(Case):
    def setUp(self):
        super().setUp()
        self.t = self.b.teacher('Roster Teacher', roster=True)
        self.s = self.b.student('طالب خامس تجربة')
        self.entries = [confirmed(['معلم الجدول'], self.t, 'EXISTING_SCHEDULE')]
        for m in (600, 630, 660):   # evidence for the roster mapping
            self.b.lesson(self.t, 5, m, 30, [self.s], status='ended')
        self.content = {'الجمعة': [('معلم الجدول', {col_for(m): 'طالب خامس تجربة' for m in (600, 630, 660)})]}

    def test_same_lesson_already_present_is_not_imported(self):
        self.b.lesson(self.t, 0, 960, 30, [self.s])
        self.content['الاحد'] = [('معلم الجدول', {col_for(960): 'طالب خامس تجربة'})]
        _, _, out = self.run_pipeline(self.content, self.entries, roster=[self.t])
        self.assertEqual(out[('الاحد', f'{col_for(960)}3')].status, 'ALREADY_PRESENT')

    def test_already_imported_from_the_same_source_by_provenance_key(self):
        _, res, _ = self.run_pipeline(self.content, self.entries, roster=[self.t])
        sha = res['outcomes'][0].source_key.split('@')[1]
        self.b.lesson(self.t, 5, 600, 30, [self.s], source=('الجمعة', f'{col_for(600)}3@{sha}'))
        _, _, out = self.run_pipeline(self.content, self.entries, roster=[self.t])
        self.assertEqual(out[('الجمعة', f'{col_for(600)}3')].status, 'ALREADY_PRESENT')

    def test_existing_lesson_at_another_time_is_kept_and_flagged(self):
        existing = self.b.lesson(self.t, 0, 900, 30, [self.s])
        self.content['الاحد'] = [('معلم الجدول', {col_for(960): 'طالب خامس تجربة'})]
        _, res, out = self.run_pipeline(self.content, self.entries, roster=[self.t])
        o = out[('الاحد', f'{col_for(960)}3')]
        self.assertEqual(o.status, 'PENDING')
        self.assertIn('POSSIBLE_RESCHEDULE', o.reasons)
        self.assertIn(existing, o.related_lesson_ids)

    def test_two_distinct_legitimate_lessons_are_not_deduplicated(self):
        # Same teacher and student, two days; and the same student with the same teacher at two times.
        self.content['الاحد'] = [('معلم الجدول', {col_for(900): 'طالب خامس تجربة', col_for(1020): 'طالب خامس تجربة'})]
        self.content['الاثنين'] = [('معلم الجدول', {col_for(900): 'طالب خامس تجربة'})]
        _, res, out = self.run_pipeline(self.content, self.entries, roster=[self.t])
        items = plan_items(res['outcomes'])
        keys = {(i['day_of_week'], i['start_minute']) for i in items}
        self.assertTrue({(0, 900), (0, 1020), (1, 900)} <= keys)

    def test_roster_change_invalidates_the_map(self):
        _, res, _ = self.run_pipeline(self.content, self.entries, roster=[])
        self.assertTrue(any(p.startswith('ROSTER_CHANGED') for p in res['map_problems']))

    def test_hourly_teacher_without_availability_is_imported_as_hourly(self):
        h = self.b.teacher('Hourly Teacher')
        self.content['سبت'] = [('معلم بالساعة', {col_for(14 * 60): 'طالب خامس تجربة'})]
        _, _, out = self.run_pipeline(self.content, self.entries + [confirmed(['معلم بالساعة'], h)], roster=[self.t])
        o = out[('سبت', f'{col_for(14 * 60)}3')]
        self.assertEqual((o.status, o.teacher_classification), ('IMPORT', 'hourly'))

    def test_two_cells_overlapping_each_other_are_both_held(self):
        self.content['الاحد'] = [('معلم الجدول', {col_for(900): ('طالب خامس تجربة', 2)}),
                                 ('معلم الجدول', {col_for(930): 'طالب خامس تجربة'})]
        _, _, out = self.run_pipeline(self.content, self.entries, roster=[self.t])
        self.assertIn('SOURCE_OVERLAP', out[('الاحد', f'{col_for(900)}3')].reasons)
        self.assertIn('SOURCE_OVERLAP', out[('الاحد', f'{col_for(930)}4')].reasons)

    def test_every_cell_has_exactly_one_outcome(self):
        self.content['سبت'] = [('', {'C': 'طالب خامس تجربة'}), ('معلم الجدول', {'D': '   '})]
        parsed, res, _ = self.run_pipeline(self.content, self.entries, roster=[self.t])
        self.assertEqual(len(res['outcomes']), len(parsed.lessons))
        self.assertEqual(len({(o.sheet, o.cell) for o in res['outcomes']}), len(parsed.lessons))
        self.assertTrue(all(o.status in ('ALREADY_PRESENT', 'IMPORT', 'PENDING', 'REJECTED') for o in res['outcomes']))


class MalformedSource(Case):
    def test_row_without_teacher(self):
        t = self.b.teacher('T'); self.b.student('طالب سادس تجربة')
        _, _, out = self.run_pipeline({'سبت': [('', {'C': 'طالب سادس تجربة'})]}, [confirmed(['ت'], t)])
        self.assertEqual(out[('سبت', 'C3')].reasons[0], 'NO_TEACHER_IN_ROW')

    def test_whitespace_and_empty_merges_are_not_lessons(self):
        path = make_workbook(os.path.join(self.tmp.name, 'w.xlsx'), {'سبت': [('ت', {'C': '   ', 'E': (None, 2)})]})
        parsed = parse_workbook(path)
        self.assertEqual(len(parsed.lessons), 0)
        self.assertEqual(len(parsed.non_lessons), 2)

    def test_unknown_sheet_rejects_the_workbook(self):
        path = make_workbook(os.path.join(self.tmp.name, 'w.xlsx'), extra_sheets=['ملاحظات'])
        with self.assertRaises(WorkbookError):
            parse_workbook(path)


if __name__ == '__main__':
    unittest.main()

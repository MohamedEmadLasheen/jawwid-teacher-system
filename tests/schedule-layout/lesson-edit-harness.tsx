import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@/index.css';
import i18n from '@/i18n';

import { LessonDetailDialog } from '@/features/scheduling/components/LessonDetailDialog';
import { schedulingKeys } from '@/features/scheduling/api/queryKeys';
import { useTeacherStore } from '@/store/teacherStore';
import { useSupervisorStore } from '@/store/supervisorStore';
import type { LessonWithParticipants } from '@/services/scheduling/lessons.service';

/**
 * The redesigned Lesson Details card, opened through the REAL
 * LessonDetailDialog in edit mode — i.e. through the same entry point
 * MasterSchedulePage, the teacher week view and the mobile sheet use, so the
 * delegation to LessonEditDialog is part of what is under test.
 *
 * `@/lib/supabase` is aliased to supabase-stub.ts, which records every RPC
 * call on window.__supabaseStub. That is how the tests assert WHICH lessons a
 * scoped save or a scoped removal actually touched — the whole risk of this
 * feature is touching more rows than the admin chose.
 *
 *   ?dir=ltr|rtl   direction, applied to <html> as the app does
 *   ?slot=single   give the subject no slot siblings
 *
 * Fixtures only — no production data, no network.
 */
const params = new URLSearchParams(window.location.search);
const DIR = (params.get('dir') === 'rtl' ? 'rtl' : 'ltr') as 'ltr' | 'rtl';
const SINGLE = params.get('slot') === 'single';
i18n.changeLanguage(DIR === 'rtl' ? 'ar' : 'en');
document.documentElement.dir = DIR;
document.documentElement.lang = DIR === 'rtl' ? 'ar' : 'en';

const START = 15 * 60; // 3:00 PM

const teachers = [
  { id: 'T1', fullName: 'Mohamed Hussein' },
  { id: 'T2', fullName: 'Rokaya Ramadan' },
  { id: 'T3', fullName: 'Zainab Hazem' },
].map((t) => ({
  ...t, phone: '', email: '', nationality: '', joiningDate: null, monthlySalary: 0,
  salaryCurrency: 'EGP', salaryType: 'fixed', teachingMarket: 'arab', specializations: [],
  status: 'active', level: 'silver', notes: '', isDeleted: false, deletedAt: null,
  teacherType: 'shift', branchId: null, maxWeeklyHours: null,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
})) as any[];

const students = [
  { id: 'S1', fullName: 'Ahmed Mohamed' },
  { id: 'S9', fullName: 'Fatima Ali' },
].map((s) => ({
  ...s, parentId: null, supervisorId: null, gender: 'male', birthDate: null,
  country: '', timezone: 'Asia/Dubai', level: '', notes: '', status: 'active',
  isDeleted: false, deletedAt: null,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
})) as any[];

const makeLesson = (
  id: string, dayOfWeek: number, startMinute: number, studentId: string,
  extra: Partial<{ lifecycleStatus: string; teacherId: string }> = {}
) => ({
  id, branchId: null, teacherId: extra.teacherId ?? 'T1', courseId: null, dayOfWeek,
  startMinute, durationMinutes: 30, endMinute: startMinute + 30,
  timezone: 'Asia/Dubai', lifecycleStatus: (extra.lifecycleStatus ?? 'active') as 'active',
  effectiveFrom: '2026-01-01', effectiveUntil: null, originalTeacherId: 'T1',
  sameDaySince: '2026-01-01', sameTimeSince: '2026-01-01', notes: '',
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  participants: [{ id: `${id}-p`, lessonId: id, studentId, createdAt: '2026-01-01T00:00:00Z' }],
}) as unknown as LessonWithParticipants;

/**
 * Ahmed's 3:00 PM pattern is Sunday / Tuesday / Thursday — three lessons in
 * one slot. Everything else exists to prove it is NOT swept in:
 *   DECOY-TIME     same student, different minute
 *   DECOY-STUDENT  same minute, different student
 *   DECOY-ENDED    same student and minute, but already ended
 */
const subject = makeLesson('L-SUN', 0, START, 'S1');
const slotSiblings = SINGLE ? [] : [makeLesson('L-TUE', 2, START, 'S1'), makeLesson('L-THU', 4, START, 'S1')];
const decoys = [
  makeLesson('DECOY-TIME', 1, START + 30, 'S1'),
  makeLesson('DECOY-STUDENT', 2, START, 'S9', { teacherId: 'T2' }),
  makeLesson('DECOY-ENDED', 3, START, 'S1', { lifecycleStatus: 'ended' }),
];
const allLessons = [subject, ...slotSiblings, ...decoys];

function Harness() {
  const [open, setOpen] = useState(true);
  const [saved, setSaved] = useState(0);

  return (
    <div style={{ padding: 8 }}>
      {open && (
        <LessonDetailDialog
          mode="edit"
          lesson={subject}
          onClose={() => setOpen(false)}
          onSaved={() => { setSaved((n) => n + 1); setOpen(false); }}
        />
      )}
      <button type="button" data-testid="reopen" onClick={() => setOpen(true)}>reopen</button>
      <div
        data-testid="fixtures"
        data-open={String(open)}
        data-saved={saved}
        data-subject={subject.id}
        data-slot-ids={[subject, ...slotSiblings].map((l) => l.id).join(',')}
        data-decoy-ids={decoys.map((l) => l.id).join(',')}
      />
      <div data-testid="ready" />
    </div>
  );
}

/**
 * The same fixtures in DB row shape, handed to the supabase stub.
 *
 * Seeding React Query alone is not enough: every successful mutation
 * invalidates the scheduling keys, the queries refetch, and without this the
 * stub would answer with an empty table — so the second action in a test
 * would see a schedule with no lessons in it.
 */
const toRow = (l: LessonWithParticipants) => ({
  id: l.id, branch_id: null, teacher_id: l.teacherId, course_id: null,
  day_of_week: l.dayOfWeek, start_minute: l.startMinute,
  duration_minutes: l.durationMinutes, end_minute: l.startMinute + l.durationMinutes,
  timezone: 'Asia/Dubai', lifecycle_status: l.lifecycleStatus,
  effective_from: '2026-01-01', effective_until: null, original_teacher_id: l.teacherId,
  same_day_since: '2026-01-01', same_time_since: '2026-01-01', notes: '',
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
});

const stub = (window as unknown as { __supabaseStub?: { tables: Record<string, unknown[]> } }).__supabaseStub;
if (stub) {
  stub.tables.lessons = allLessons.map(toRow);
  stub.tables.lesson_participants = allLessons.flatMap((l) =>
    l.participants.map((p) => ({
      id: p.id, lesson_id: l.id, student_id: p.studentId,
      created_at: '2026-01-01T00:00:00Z',
    }))
  );
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
queryClient.setQueryData(schedulingKeys.students(), students);
queryClient.setQueryData(schedulingKeys.courses(), []);
queryClient.setQueryData(schedulingKeys.parents(), []);
queryClient.setQueryData(schedulingKeys.studentParents(), []);
// What useSameTimeSlotLessons reads: the whole lessons table plus the
// participant join, under the keys the app already defines.
queryClient.setQueryData(schedulingKeys.lessons(), allLessons);
queryClient.setQueryData(
  schedulingKeys.lessonParticipants(),
  allLessons.flatMap((l) => l.participants)
);

useTeacherStore.setState({ teachers } as any);
useSupervisorStore.setState({ supervisors: [] } as any);

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}><Harness /></QueryClientProvider>
);

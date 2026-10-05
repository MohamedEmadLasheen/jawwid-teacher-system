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
/** ?mode=create exercises the untouched create path of LessonDetailDialog. */
const MODE = params.get('mode') === 'create' ? 'create' : 'edit';
i18n.changeLanguage(DIR === 'rtl' ? 'ar' : 'en');
document.documentElement.dir = DIR;
document.documentElement.lang = DIR === 'rtl' ? 'ar' : 'en';

const teachers = [
  { id: 'TA', fullName: 'Teacher A' },
  { id: 'TB', fullName: 'Teacher B' },
  { id: 'TC', fullName: 'Teacher C' },
  { id: 'TD', fullName: 'Teacher D' },
  { id: 'TE', fullName: 'Teacher E' },
  { id: 'TF', fullName: 'Teacher F' },
  { id: 'TZ', fullName: 'Teacher Z' },
].map((t) => ({
  ...t, phone: '', email: '', nationality: '', joiningDate: null, monthlySalary: 0,
  salaryCurrency: 'EGP', salaryType: 'fixed', teachingMarket: 'arab', specializations: [],
  status: 'active', level: 'silver', notes: '', isDeleted: false, deletedAt: null,
  teacherType: 'shift', branchId: null, maxWeeklyHours: null,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
})) as any[];

const students = [
  { id: 'SA', fullName: 'Student A' },
  { id: 'SB', fullName: 'Student B' },
  { id: 'SC', fullName: 'Student C' },
  { id: 'SD', fullName: 'Student D' },
  { id: 'SE', fullName: 'Student E' },
  { id: 'SF', fullName: 'Student F' },
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
  id, branchId: null, teacherId: extra.teacherId ?? 'TA', courseId: null, dayOfWeek,
  startMinute, durationMinutes: 30, endMinute: startMinute + 30,
  timezone: 'Asia/Dubai', lifecycleStatus: (extra.lifecycleStatus ?? 'active') as 'active',
  effectiveFrom: '2026-01-01', effectiveUntil: null, originalTeacherId: extra.teacherId ?? 'TA',
  sameDaySince: '2026-01-01', sameTimeSince: '2026-01-01', notes: '',
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  participants: [{ id: `${id}-p`, lessonId: id, studentId, createdAt: '2026-01-01T00:00:00Z' }],
}) as unknown as LessonWithParticipants;

/**
 * The seed is the reviewer's, exactly:
 *
 *   Sunday 10:00   A/StudentA   B/StudentB   C/StudentC   <- the slot
 *   Sunday 10:30   D/StudentD                             <- different minute
 *   Monday 10:00   E/StudentE                             <- different day
 *
 * Plus a second group proving a shared STUDENT does not group lessons:
 * Student A also has Tuesday 10:00 and Sunday 14:00. Neither is in the
 * Sunday-10:00 slot, because membership is day+minute and nothing else.
 *
 * ?conflict=third makes the third slot member (SUN-C) the one that fails its
 * conflict check, so a test can prove the first two are never written.
 */
const SLOT_START = 10 * 60;
const subject  = makeLesson('SUN-A', 0, SLOT_START, 'SA', { teacherId: 'TA' });
const slotB    = makeLesson('SUN-B', 0, SLOT_START, 'SB', { teacherId: 'TB' });
const slotC    = makeLesson('SUN-C', 0, SLOT_START, 'SC', { teacherId: 'TC' });
const slotSiblings = SINGLE ? [] : [slotB, slotC];
const decoys = [
  makeLesson('SUN-1030-D', 0, SLOT_START + 30, 'SD', { teacherId: 'TD' }),
  makeLesson('MON-1000-E', 1, SLOT_START, 'SE', { teacherId: 'TE' }),
  // Same student as the subject, other days/times — must never be grouped in.
  makeLesson('TUE-1000-A', 2, SLOT_START, 'SA', { teacherId: 'TA' }),
  makeLesson('SUN-1400-A', 0, 14 * 60, 'SA', { teacherId: 'TA' }),
  // Same slot but already ended — history, never touched.
  makeLesson('SUN-ENDED', 0, SLOT_START, 'SF', { teacherId: 'TF', lifecycleStatus: 'ended' }),
];
const allLessons = [subject, ...slotSiblings, ...decoys];

function Harness() {
  const [open, setOpen] = useState(true);
  const [saved, setSaved] = useState(0);

  return (
    <div style={{ padding: 8 }}>
      {open && MODE === 'edit' && (
        <LessonDetailDialog
          mode="edit"
          lesson={subject}
          onClose={() => setOpen(false)}
          onSaved={() => { setSaved((n) => n + 1); setOpen(false); }}
        />
      )}
      {open && MODE === 'create' && (
        <LessonDetailDialog
          mode="create"
          teacherId="TA"
          dayOfWeek={0}
          startMinute={SLOT_START}
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
        data-slot-start={SLOT_START}
        data-mode={MODE}
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

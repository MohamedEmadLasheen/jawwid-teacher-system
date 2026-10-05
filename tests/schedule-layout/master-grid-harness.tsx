import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@/index.css';
import i18n from '@/i18n';

import { MasterScheduleGrid } from '@/features/scheduling/components/MasterScheduleGrid';
import { LessonQuickActionsSheet } from '@/features/scheduling/components/LessonQuickActionsSheet';
import { LessonDetailDialog } from '@/features/scheduling/components/LessonDetailDialog';
import { ChangeSimulatorDialog } from '@/features/scheduling/components/ChangeSimulatorDialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { schedulingKeys } from '@/features/scheduling/api/queryKeys';
import { useTeacherStore } from '@/store/teacherStore';
import { useSupervisorStore } from '@/store/supervisorStore';
import { useScheduleUiStore } from '@/store/scheduleUiStore';
import { nextDateForDayOfWeek } from '@/features/scheduling/utils/nextDateForDayOfWeek';
import type { LessonWithParticipants } from '@/services/scheduling/lessons.service';
import type { DayOfWeek } from '@/lib/types';

/**
 * The master schedule as the page actually assembles it: the real
 * MasterScheduleGrid (virtualizer, roster groups, sticky header, one scroll
 * container, the real DndContext) wired to the same handlers
 * MasterSchedulePage uses, including the useIsMobile branch between Quick
 * Actions and LessonDetailDialog.
 *
 * The earlier quick-actions harness renders a single ScheduleGridRow, which
 * is enough to test the sheet but NOT enough to reproduce anything involving
 * virtualization, row remounting, the grid's own scroll container, or the
 * page's routing. This one exists for exactly those.
 *
 *   ?dir=ltr|rtl    direction, applied to <html> as the app does
 *   ?rows=N         teacher rows to generate (default 12, enough to scroll)
 *
 * Fixtures only — no production data, no network.
 */
const params = new URLSearchParams(window.location.search);
const DIR = (params.get('dir') === 'rtl' ? 'rtl' : 'ltr') as 'ltr' | 'rtl';
const ROWS = Number(params.get('rows') ?? 12);
i18n.changeLanguage(DIR === 'rtl' ? 'ar' : 'en');
document.documentElement.dir = DIR;
document.documentElement.lang = DIR === 'rtl' ? 'ar' : 'en';

const DAY = 0 as DayOfWeek;
const SHIFT_START = 14 * 60;
const SHIFT_END = 18 * 60;
const SUBJECT_START = 15 * 60;
const OCCUPIED_START = 16 * 60;

const NAMES = [
  'Mohamed Hussein', 'Rokaya Ramadan', 'Zainab Hazem', 'Arwa Ahmed',
  'Asmaa Magdy', 'Aya Mustafa', 'Doaa Zakaria', 'Ghada Ragab',
  'Hend Mohammed', 'Menna Ebrahim', 'Menna Ramadan', 'Yasmeen Saad',
];

const teachers = Array.from({ length: ROWS }, (_, i) => ({
  id: `T${i + 1}`,
  fullName: NAMES[i % NAMES.length],
  phone: '', email: '', nationality: '', joiningDate: null, monthlySalary: 0,
  salaryCurrency: 'EGP', salaryType: 'fixed', teachingMarket: 'arab', specializations: [],
  status: 'active', level: 'silver', notes: '', isDeleted: false, deletedAt: null,
  teacherType: 'shift', branchId: null, maxWeeklyHours: null,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
})) as any[];

const shiftTemplates = [{
  id: 'TPL-1', name: 'Full-time', startMinute: SHIFT_START, endMinute: SHIFT_END,
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6], isActive: true,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
}] as any[];

const shiftAssignments = teachers.map((t, i) => ({
  id: `A${i + 1}`, teacherId: t.id, shiftTemplateId: 'TPL-1', isActive: true,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
})) as any[];

const availability = teachers.map((t) => ({
  teacherId: t.id, dayOfWeek: DAY,
  startMinute: SHIFT_START, endMinute: SHIFT_END,
  timezone: 'Asia/Dubai', source: 'shift' as const,
}));

const students = [
  { id: 'S1', fullName: 'Ahmed Mohamed' },
  { id: 'S2', fullName: 'Fatima Ali' },
].map((s) => ({
  ...s, parentId: null, supervisorId: null, gender: 'male', birthDate: null,
  country: '', timezone: 'Asia/Dubai', level: '', notes: '', status: 'active',
  isDeleted: false, deletedAt: null,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
})) as any[];

const makeLesson = (
  id: string, teacherId: string, startMinute: number, studentId: string
) => ({
  id, branchId: null, teacherId, courseId: null, dayOfWeek: DAY,
  startMinute, durationMinutes: 30, endMinute: startMinute + 30,
  timezone: 'Asia/Dubai', lifecycleStatus: 'active' as const,
  effectiveFrom: '2026-01-01', effectiveUntil: null, originalTeacherId: teacherId,
  sameDaySince: '2026-01-01', sameTimeSince: '2026-01-01', notes: '',
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  participants: [{ id: `${id}-p`, lessonId: id, studentId, createdAt: '2026-01-01T00:00:00Z' }],
}) as unknown as LessonWithParticipants;

// Every teacher gets the same two lessons, so a card exists in any row the
// virtualizer happens to have mounted.
const lessons = teachers.flatMap((t, i) => [
  makeLesson(`L-subject-${i}`, t.id, SUBJECT_START, 'S1'),
  makeLesson(`L-other-${i}`, t.id, OCCUPIED_START, 'S2'),
]);

/**
 * The value useIsMobile returned on the very FIRST render, captured once.
 *
 * This is the structural guarantee behind "the hover preview must never be
 * mounted on mobile": if the hook starts out false and only corrects itself
 * in an effect, then every consumer renders once as desktop, and for that
 * render the preview really is mounted on a phone. Sampling the DOM cannot
 * test this reliably — React corrects it within a frame — so the first-render
 * value is recorded here and asserted directly.
 */
let firstRenderIsMobile: boolean | null = null;

function Harness() {
  const isMobile = useIsMobile();
  if (firstRenderIsMobile === null) firstRenderIsMobile = isMobile;
  const [quickActionsLesson, setQuickActionsLesson] = useState<LessonWithParticipants | null>(null);
  const [editingLesson, setEditingLesson] = useState<LessonWithParticipants | null>(null);
  const [proposedMove, setProposedMove] = useState<
    { lesson: LessonWithParticipants; newTeacherId: string; newStartMinute: number } | null
  >(null);

  return (
    <div style={{ padding: 8 }}>
      {/* Exactly MasterSchedulePage's wiring. */}
      <MasterScheduleGrid
        onEmptyClick={() => {}}
        onLessonClick={(lesson) => (isMobile ? setQuickActionsLesson(lesson) : setEditingLesson(lesson))}
        onProposeMove={(lesson, newTeacherId, newStartMinute) =>
          setProposedMove({ lesson, newTeacherId, newStartMinute })
        }
      />

      {quickActionsLesson && (
        <LessonQuickActionsSheet
          lesson={quickActionsLesson}
          onClose={() => setQuickActionsLesson(null)}
          onViewDetails={() => {
            setEditingLesson(quickActionsLesson);
            setQuickActionsLesson(null);
          }}
        />
      )}

      {editingLesson && (
        <LessonDetailDialog
          mode="edit"
          lesson={editingLesson}
          onClose={() => setEditingLesson(null)}
          onSaved={() => setEditingLesson(null)}
          onProposeMove={(lesson, newTeacherId, newStartMinute) => {
            setEditingLesson(null);
            setProposedMove({ lesson, newTeacherId, newStartMinute });
          }}
        />
      )}

      {proposedMove && (
        <ChangeSimulatorDialog
          lesson={proposedMove.lesson}
          proposedTeacherId={proposedMove.newTeacherId}
          proposedStartMinute={proposedMove.newStartMinute}
          onClose={() => setProposedMove(null)}
          onConfirmed={() => setProposedMove(null)}
        />
      )}

      <div
        data-testid="fixtures"
        data-is-mobile={String(isMobile)}
        data-first-render-mobile={String(firstRenderIsMobile)}
        data-subject-start={SUBJECT_START}
        data-occupied-start={OCCUPIED_START}
        data-proposed-move={proposedMove ? `${proposedMove.newTeacherId}:${proposedMove.newStartMinute}` : ''}
      />
      <div data-testid="ready" />
    </div>
  );
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
queryClient.setQueryData(schedulingKeys.students(), students);
queryClient.setQueryData(schedulingKeys.courses(), []);
queryClient.setQueryData(schedulingKeys.parents(), []);
queryClient.setQueryData(schedulingKeys.studentParents(), []);
queryClient.setQueryData(schedulingKeys.shiftTemplates(), shiftTemplates);
queryClient.setQueryData(schedulingKeys.teacherShiftAssignments(undefined), shiftAssignments);
queryClient.setQueryData(schedulingKeys.grid(DAY), lessons);
queryClient.setQueryData(schedulingKeys.availabilityForDay(DAY), availability);
queryClient.setQueryData(schedulingKeys.exceptionsForDate(nextDateForDayOfWeek(DAY)), []);

useTeacherStore.setState({ teachers } as any);
useSupervisorStore.setState({ supervisors: [] } as any);
useScheduleUiStore.setState({ selectedDay: DAY });

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}><Harness /></QueryClientProvider>
);

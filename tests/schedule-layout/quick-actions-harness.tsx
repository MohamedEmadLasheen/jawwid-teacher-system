import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DndContext } from '@dnd-kit/core';
import '@/index.css';
import i18n from '@/i18n';

import { ScheduleGridRow } from '@/features/scheduling/components/ScheduleGridRow';
import { LessonQuickActionsSheet } from '@/features/scheduling/components/LessonQuickActionsSheet';
import { LessonDetailDialog } from '@/features/scheduling/components/LessonDetailDialog';
import { useScheduleDragSensors } from '@/features/scheduling/hooks/useScheduleDragSensors';
import { useScheduleMetrics } from '@/features/scheduling/hooks/useScheduleMetrics';
import { useIsMobile } from '@/hooks/use-mobile';
import { GRID_COLUMNS } from '@/features/scheduling/constants/schedulingConstants';
import { timelineWidth } from '@/features/scheduling/utils/timelineGeometry';
import { schedulingKeys } from '@/features/scheduling/api/queryKeys';
import { useTeacherStore } from '@/store/teacherStore';
import { useSupervisorStore } from '@/store/supervisorStore';
import type { LessonWithParticipants } from '@/services/scheduling/lessons.service';

/**
 * Mobile lesson Quick Actions, rendered through the REAL components:
 * ScheduleGridRow → LessonCell → DraggableLessonCard supplies the tap, the
 * production drag sensors (useScheduleDragSensors) arbitrate tap-vs-drag, and
 * the sheet under test is the shipping LessonQuickActionsSheet wired exactly
 * as MasterSchedulePage wires it on mobile — including the handoff to the
 * real LessonDetailDialog behind "View details".
 *
 * `@/lib/supabase` is aliased to supabase-stub.ts, which records every RPC
 * call on window.__supabaseStub, so the tests can assert which scheduling
 * action ran — and that no DELETE ever did.
 *
 *   ?dir=ltr|rtl   direction, applied to <html> as the app does
 *
 * Fixtures only — no production data, no network.
 */
const params = new URLSearchParams(window.location.search);
const DIR = (params.get('dir') === 'rtl' ? 'rtl' : 'ltr') as 'ltr' | 'rtl';
i18n.changeLanguage(DIR === 'rtl' ? 'ar' : 'en');
document.documentElement.dir = DIR;
document.documentElement.lang = DIR === 'rtl' ? 'ar' : 'en';

const DAY = 0; // Sunday
const SHIFT_START = 14 * 60;   // the fixture teacher works 2:00 PM – 6:00 PM
const SHIFT_END = 18 * 60;

const availability = [{
  teacherId: 'T1', dayOfWeek: DAY,
  startMinute: SHIFT_START, endMinute: SHIFT_END,
  timezone: 'Asia/Dubai', source: 'shift' as const,
}];

const makeLesson = (
  id: string, teacherId: string, startMinute: number, durationMinutes: number, studentId: string
) => ({
  id, branchId: null, teacherId, courseId: null, dayOfWeek: DAY,
  startMinute, durationMinutes, endMinute: startMinute + durationMinutes,
  timezone: 'Asia/Dubai', lifecycleStatus: 'active' as const,
  effectiveFrom: '2026-01-01', effectiveUntil: null, originalTeacherId: teacherId,
  sameDaySince: '2026-01-01', sameTimeSince: '2026-01-01', notes: '',
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  participants: [{ id: `${id}-p`, lessonId: id, studentId, createdAt: '2026-01-01T00:00:00Z' }],
}) as unknown as LessonWithParticipants;

// The lesson under test (3:00–3:30 PM) plus a second lesson at 4:00 PM, so
// one candidate time is genuinely occupied by something other than itself.
const SUBJECT_START = 15 * 60;
const OCCUPIED_START = 16 * 60;
const lessons = [
  makeLesson('L-subject', 'T1', SUBJECT_START, 30, 'S1'),
  makeLesson('L-other', 'T1', OCCUPIED_START, 30, 'S2'),
];

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
  { id: 'S2', fullName: 'Fatima Ali' },
].map((s) => ({
  ...s, parentId: null, supervisorId: null, gender: 'male', birthDate: null,
  country: '', timezone: 'Asia/Dubai', level: '', notes: '', status: 'active',
  isDeleted: false, deletedAt: null,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
})) as any[];

function Harness() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { columnWidth, teacherColumnWidth, rowHeight, isCompact } =
    useScheduleMetrics(scrollRef, GRID_COLUMNS.length);
  // The same activation constraints production uses — so a test that taps a
  // lesson is testing the real tap-vs-drag arbitration, not a local copy.
  const sensors = useScheduleDragSensors();

  // The SAME routing MasterSchedulePage uses, through the same hook: below
  // 768px a tap opens Quick Actions, at or above it the tap still opens the
  // full dialog. Duplicating the branch here instead of reading the hook
  // would make the desktop regression test prove nothing.
  const isMobile = useIsMobile();
  const [quickActionsLesson, setQuickActionsLesson] = useState<LessonWithParticipants | null>(null);
  const [editingLesson, setEditingLesson] = useState<LessonWithParticipants | null>(null);

  const contentWidth = teacherColumnWidth + timelineWidth(columnWidth);

  return (
    <div style={{ padding: 8 }}>
      <div className="border rounded-lg overflow-hidden bg-white">
        <div ref={scrollRef} data-testid="scroller" className="overflow-auto" style={{ maxHeight: 200 }}>
          <div style={{ width: contentWidth, position: 'relative' }}>
            <DndContext sensors={sensors}>
              <div style={{ height: rowHeight }} data-testid="row">
                <ScheduleGridRow
                  row={{
                    teacher: teachers[0],
                    availability: availability as any,
                    lessons,
                  }}
                  columnWidth={columnWidth}
                  teacherColumnWidth={teacherColumnWidth}
                  isCompact={isCompact}
                  onEmptyClick={() => {}}
                  onLessonClick={(lesson) =>
                    isMobile ? setQuickActionsLesson(lesson) : setEditingLesson(lesson)
                  }
                />
              </div>
            </DndContext>
          </div>
        </div>
      </div>

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
          onProposeMove={() => {}}
        />
      )}

      <div
        data-testid="fixtures"
        data-subject-start={SUBJECT_START}
        data-occupied-start={OCCUPIED_START}
        data-shift-start={SHIFT_START}
        data-shift-end={SHIFT_END}
        data-is-mobile={String(isMobile)}
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
// What useTeacherDaySlots reads — the UNFILTERED day, same keys the grid fills.
queryClient.setQueryData(schedulingKeys.grid(DAY), lessons);
queryClient.setQueryData(schedulingKeys.availabilityForDay(DAY), availability);

useTeacherStore.setState({ teachers } as any);
useSupervisorStore.setState({ supervisors: [] } as any);

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}><Harness /></QueryClientProvider>
);

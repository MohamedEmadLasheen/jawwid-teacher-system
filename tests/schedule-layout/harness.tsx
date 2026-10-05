import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DndContext } from '@dnd-kit/core';
import '@/index.css';
import '@/i18n';

import { ScheduleTimeHeader } from '@/features/scheduling/components/ScheduleTimeHeader';
import { ScheduleGridRow } from '@/features/scheduling/components/ScheduleGridRow';
import { CurrentTimeIndicator } from '@/features/scheduling/components/CurrentTimeIndicator';
import { timelineWidth } from '@/features/scheduling/utils/timelineGeometry';
import { GRID_ROW_HEIGHT, GRID_TEACHER_COLUMN_WIDTH } from '@/features/scheduling/constants/schedulingConstants';
import { useScheduleMetrics } from '@/features/scheduling/hooks/useScheduleMetrics';
import { GRID_COLUMNS } from '@/features/scheduling/constants/schedulingConstants';
import { schedulingKeys } from '@/features/scheduling/api/queryKeys';
import { useSupervisorStore } from '@/store/supervisorStore';

/**
 * Renders the REAL schedule components, with the project's real Tailwind build
 * (this harness is served by a Vite config rooted at the repo, so
 * postcss.config.js and tailwind.config.ts apply exactly as in production).
 *
 * Driven entirely by query parameters so one page serves every case the
 * Playwright spec needs:
 *
 *   ?dir=ltr|rtl        direction applied to the scroll container
 *   ?cw=<px>            column width (the responsive hook is bypassed so the
 *                       test controls the scale deterministically)
 *
 * Fixtures only — no production data, no network.
 */
const params = new URLSearchParams(window.location.search);
const DIR = (params.get('dir') === 'rtl' ? 'rtl' : 'ltr') as 'ltr' | 'rtl';
const COLUMN_WIDTH = Number(params.get('cw') ?? 96);
/** ?responsive=1 drops the fixed cw and uses the real useScheduleMetrics ladder. */
const RESPONSIVE = params.get('responsive') === '1';

const SHIFT_START = 12 * 60;   // 12:00 — full-time working-window start
const SHIFT_END = 19 * 60;     // 19:00 — full-time working-window end

const availability = [{
  teacherId: 'T', dayOfWeek: 0,
  startMinute: SHIFT_START, endMinute: SHIFT_END,
  timezone: 'Asia/Dubai', source: 'shift' as const,
}];

const makeLesson = (id: string, startMinute: number, durationMinutes: number) => ({
  id, branchId: null, teacherId: 'T', courseId: null, dayOfWeek: 0 as const,
  startMinute, durationMinutes, endMinute: startMinute + durationMinutes,
  timezone: 'Asia/Dubai', lifecycleStatus: 'active' as const,
  effectiveFrom: '2026-01-01', effectiveUntil: null, originalTeacherId: null,
  sameDaySince: '2026-01-01', sameTimeSince: '2026-01-01', notes: '',
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  participants: [{ id: `${id}-p`, lessonId: id, studentId: 'S', createdAt: '2026-01-01T00:00:00Z' }],
});

// Working-window start, an interior half-hour, a 40-minute (fractional-width)
// lesson, and one ending exactly on the window's end boundary.
const lessons = [
  makeLesson('L-start', SHIFT_START, 30),       // 12:00-12:30 (window start)
  makeLesson('L-mid', 15 * 60 + 30, 30),        // 15:30-16:00
  makeLesson('L-40', 16 * 60, 40),              // 16:00-16:40
  makeLesson('L-end', 18 * 60 + 30, 30),        // 18:30-19:00 (window end)
] as any[];

const teacher = {
  id: 'T', fullName: 'Harness Teacher', phone: '', email: '', nationality: '',
  joiningDate: null, monthlySalary: 0, salaryCurrency: 'EGP', salaryType: 'fixed',
  teachingMarket: 'arab', specializations: [], status: 'active', level: 'silver',
  notes: '', isDeleted: false, deletedAt: null, teacherType: 'shift',
  branchId: null, maxWeeklyHours: null,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
} as any;

const student = {
  id: 'S', fullName: 'Harness Student', parentId: null, supervisorId: null,
  gender: 'male', birthDate: null, country: '', timezone: 'Asia/Dubai',
  level: '', notes: '', status: 'active', isDeleted: false, deletedAt: null,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
} as any;

function Harness() {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    useSupervisorStore.setState({ supervisors: [] } as any);
    // The app sets dir on <html>; mirror that so inherited direction is real.
    document.documentElement.dir = DIR;
    document.documentElement.lang = DIR === 'rtl' ? 'ar' : 'en';
  }, []);

  const live = useScheduleMetrics(scrollRef, GRID_COLUMNS.length);
  const columnWidth = RESPONSIVE ? live.columnWidth : COLUMN_WIDTH;
  const teacherColumnWidth = RESPONSIVE ? live.teacherColumnWidth : GRID_TEACHER_COLUMN_WIDTH;
  const rowHeight = RESPONSIVE ? live.rowHeight : GRID_ROW_HEIGHT;
  const isCompact = RESPONSIVE ? live.isCompact : false;
  const contentWidth = teacherColumnWidth + timelineWidth(columnWidth);

  return (
    <div style={{ padding: 8 }}>
      <div className="border rounded-lg overflow-hidden bg-white">
        <div
          ref={scrollRef}
          data-testid="scroller"
          className="overflow-auto"
          style={{ maxHeight: 220, width: RESPONSIVE ? '100%' : 640 }}
        >
          <div style={{ width: contentWidth, position: 'relative' }}>
            <ScheduleTimeHeader columnWidth={columnWidth} teacherColumnWidth={teacherColumnWidth} isCompact={isCompact} cornerLabel="Day" />
            <div style={{ position: 'relative' }}>
              <CurrentTimeIndicator columnWidth={columnWidth} teacherColumnWidth={teacherColumnWidth} height={rowHeight} />
              <DndContext>
                <div style={{ height: rowHeight }} data-testid="row">
                  <ScheduleGridRow
                    row={{ teacher, availability: availability as any, lessons }}
                    columnWidth={columnWidth}
                    teacherColumnWidth={teacherColumnWidth}
                    isCompact={isCompact}
                    label="Sunday"
                    onEmptyClick={() => {}}
                    onLessonClick={() => {}}
                  />
                </div>
              </DndContext>
            </div>
          </div>
        </div>
      </div>
      <div
        data-testid="metrics"
        data-column-width={columnWidth}
        data-teacher-column-width={teacherColumnWidth}
        data-row-height={rowHeight}
        data-compact={String(isCompact)}
      />
      <div data-testid="ready" />
    </div>
  );
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
queryClient.setQueryData(schedulingKeys.students(), [student]);
queryClient.setQueryData(schedulingKeys.courses(), []);

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}><Harness /></QueryClientProvider>
);

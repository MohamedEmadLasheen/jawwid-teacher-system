import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DndContext } from '@dnd-kit/core';
import '@/index.css';
import i18n from '@/i18n';

import { ScheduleTimeHeader, scheduleContentWidth } from '@/features/scheduling/components/ScheduleTimeHeader';
import { ScheduleGridRow } from '@/features/scheduling/components/ScheduleGridRow';
import { CurrentTimeIndicator } from '@/features/scheduling/components/CurrentTimeIndicator';
import { GRID_ROW_HEIGHT, GRID_TEACHER_COLUMN_WIDTH } from '@/features/scheduling/constants/schedulingConstants';
import { useScheduleMetrics } from '@/features/scheduling/hooks/useScheduleMetrics';
import { DAYS_OF_WEEK, GRID_COLUMNS } from '@/features/scheduling/constants/schedulingConstants';
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

// The frozen column is sized from its content, so the probe rows below must
// hold the REAL strings it has to carry: the seven translated day names (day
// grid) and the roster's own teacher names (master grid). Arabic is the
// shorter label set; English "Wednesday" and the name "Mohammed" are the
// single words that set the floor, because a single word cannot wrap.
i18n.changeLanguage(DIR === 'rtl' ? 'ar' : 'en');

const ROSTER_NAMES = [
  'Arwa Ahmed', 'Ashraf', 'Asmaa Magdy', 'Aya Mustafa', 'Doaa Zakaria',
  'Ghada Ragab', 'Hend Mohammed', 'Menna Ebrahim', 'Menna Ramadan',
  'Mohamed Hussein', 'Rokaya Ramadan', 'Yasmeen Saad', 'Yasmin Asaad',
  'Zainab Hazem',
];
const LABEL_PROBES = [...DAYS_OF_WEEK.map((d) => i18n.t(d.labelKey)), ...ROSTER_NAMES];

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
//
// The L-20xx..L-2330 lessons sit AFTER the working window ends (19:00) and
// after the old 20:00 grid boundary. They are here because the authoritative
// workbook really does schedule that late (as late as 21:30), and both facts
// have to hold at once: a lesson outside the shift still renders — working
// hours shade the row background, they never hide a lesson — and a lesson
// after 20:00 renders at all, which the old viewport made impossible.
const lessons = [
  makeLesson('L-start', SHIFT_START, 30),       // 12:00-12:30 (window start)
  makeLesson('L-mid', 15 * 60 + 30, 30),        // 15:30-16:00
  makeLesson('L-40', 16 * 60, 40),              // 16:00-16:40
  makeLesson('L-end', 18 * 60 + 30, 30),        // 18:30-19:00 (window end)
  makeLesson('L-2000', 20 * 60, 30),            // 20:00-20:30 (was invisible)
  makeLesson('L-2030', 20 * 60 + 30, 30),       // 20:30-21:00 (was invisible)
  makeLesson('L-2100', 21 * 60, 30),            // 21:00-21:30 (was invisible)
  makeLesson('L-2130', 21 * 60 + 30, 30),       // 21:30-22:00 (was invisible)
  makeLesson('L-2330', 23 * 60 + 30, 30),       // 23:30-24:00 (the midnight edge)
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
  const contentWidth = scheduleContentWidth(columnWidth, teacherColumnWidth);

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
      {/* Label-clipping probe. Rendered through the real ScheduleGridRow so the
          padding, font, border and truncation classes are the production ones;
          no lessons or availability, because only the frozen label cell is
          under test here. */}
      <div className="border rounded-lg overflow-hidden bg-white mt-2" style={{ width: teacherColumnWidth }}>
        {LABEL_PROBES.map((text) => (
          <div key={text} style={{ height: rowHeight }} data-testid="label-row" data-label={text}>
            <ScheduleGridRow
              row={{ teacher, availability: [], lessons: [] }}
              columnWidth={columnWidth}
              teacherColumnWidth={teacherColumnWidth}
              isCompact={isCompact}
              label={text}
              onEmptyClick={() => {}}
              onLessonClick={() => {}}
            />
          </div>
        ))}
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

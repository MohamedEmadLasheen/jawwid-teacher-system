import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@/index.css';
import i18n from '@/i18n';

import { ScheduleFilterBar } from '@/features/scheduling/components/ScheduleFilterBar';
import { ScheduleRosterLegend } from '@/features/scheduling/components/ScheduleRosterLegend';
import { ColorLegend } from '@/features/scheduling/components/ColorLegend';
import { MasterScheduleGrid } from '@/features/scheduling/components/MasterScheduleGrid';
import { schedulingKeys } from '@/features/scheduling/api/queryKeys';
import { useTeacherStore } from '@/store/teacherStore';
import { useSupervisorStore } from '@/store/supervisorStore';
import { useScheduleUiStore, DEFAULT_FILTERS } from '@/store/scheduleUiStore';
import { nextDateForDayOfWeek } from '@/features/scheduling/utils/nextDateForDayOfWeek';
import type { LessonWithParticipants } from '@/services/scheduling/lessons.service';
import type { DayOfWeek } from '@/lib/types';

/**
 * The Master Schedule's filter surface as the page assembles it: the real
 * ScheduleFilterBar, the real interactive legends and the real
 * MasterScheduleGrid, all reading the one scheduleUiStore.
 *
 * It exists to test what pure functions cannot: that a legend chip is a real
 * focusable control, that clicking it actually changes the rendered rows,
 * that it and the filter bar stay in step because they share one field, and
 * that none of that reflows the legend or breaks under RTL.
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

const DAY = 0 as DayOfWeek;
const FULL = { id: 'tpl-full', start: 12 * 60, end: 19 * 60 };
const PART = { id: 'tpl-part', start: 14 * 60, end: 18 * 60 };

const mkTeacher = (id: string, fullName: string) => ({
  id, fullName, phone: '', email: '', nationality: '', joiningDate: null, monthlySalary: 0,
  salaryCurrency: 'EGP', salaryType: 'fixed', teachingMarket: 'arab', specializations: [],
  status: 'active', level: 'silver', notes: '', isDeleted: false, deletedAt: null,
  teacherType: 'shift', branchId: null, maxWeeklyHours: null,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
});

// FT-1 mixed free/booked · FT-2 fully booked · FT-3 no lessons at all
// PT-1 one lesson inside the shift and one at 19:00, i.e. outside it
// PT-2 only lesson is at 10:00, entirely outside the shift
const teachers = [
  mkTeacher('FT-1', 'Arwa Ahmed'),
  mkTeacher('FT-2', 'Doaa Zakaria'),
  mkTeacher('FT-3', 'Hend Mohammed'),
  mkTeacher('PT-1', 'Aya Mustafa'),
  mkTeacher('PT-2', 'Zainab Hazem'),
] as any[];

const shiftTemplates = [
  { id: FULL.id, name: 'Full-time', startMinute: FULL.start, endMinute: FULL.end, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timezone: 'Asia/Dubai', isActive: true, createdAt: '', updatedAt: '' },
  { id: PART.id, name: 'Part-time', startMinute: PART.start, endMinute: PART.end, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timezone: 'Asia/Dubai', isActive: true, createdAt: '', updatedAt: '' },
] as any[];

const membership: Record<string, string> = {
  'FT-1': FULL.id, 'FT-2': FULL.id, 'FT-3': FULL.id, 'PT-1': PART.id, 'PT-2': PART.id,
};
const shiftAssignments = teachers.map((t) => ({
  id: `A-${t.id}`, teacherId: t.id, shiftTemplateId: membership[t.id], dayOfWeek: DAY,
  isActive: true, createdAt: '', updatedAt: '',
})) as any[];

const availability = teachers.map((t) => ({
  teacherId: t.id, dayOfWeek: DAY,
  startMinute: membership[t.id] === FULL.id ? FULL.start : PART.start,
  endMinute: membership[t.id] === FULL.id ? FULL.end : PART.end,
  timezone: 'Asia/Dubai', source: 'shift' as const,
}));

const DINA = 'sup-dina', ZAINAB = 'sup-zainab';
const supervisors = [
  { id: DINA, name: 'Dina', email: '', phone: '', department: '', status: 'active', permissions: [], colorHex: '#2563eb', createdAt: '', updatedAt: '' },
  { id: ZAINAB, name: 'Zainab', email: '', phone: '', department: '', status: 'active', permissions: [], colorHex: '#16a34a', createdAt: '', updatedAt: '' },
] as any[];

const students = [
  { id: 'S-d1', fullName: 'Ahmed Dina', supervisorId: DINA },
  { id: 'S-z1', fullName: 'Omar Zainab', supervisorId: ZAINAB },
].map((s) => ({
  ...s, parentId: null, gender: 'male', birthDate: null, country: '', timezone: 'Asia/Dubai',
  level: '', notes: '', status: 'active', enrollmentSource: '', isReturning: false, courseId: null,
  isDeleted: false, deletedAt: null, createdAt: '', updatedAt: '',
})) as any[];

const mkLesson = (
  id: string, teacherId: string, startMinute: number,
  opts: { durationMinutes?: number; studentId?: string; lifecycleStatus?: 'trial' | 'active' | 'paused' } = {}
) => {
  const durationMinutes = opts.durationMinutes ?? 60;
  const studentId = opts.studentId ?? 'S-d1';
  return {
    id, branchId: null, teacherId, courseId: null, dayOfWeek: DAY,
    startMinute, durationMinutes, endMinute: startMinute + durationMinutes,
    timezone: 'Asia/Dubai', lifecycleStatus: opts.lifecycleStatus ?? 'active',
    effectiveFrom: '2026-01-01', effectiveUntil: null, originalTeacherId: teacherId,
    sameDaySince: '2026-01-01', sameTimeSince: '2026-01-01', notes: '',
    createdAt: '', updatedAt: '',
    participants: [{ id: `${id}-p`, lessonId: id, studentId, createdAt: '' }],
  } as unknown as LessonWithParticipants;
};

const lessons = [
  mkLesson('L-ft1-a', 'FT-1', 13 * 60, { studentId: 'S-d1' }),
  mkLesson('L-ft1-t', 'FT-1', 15 * 60, { studentId: 'S-z1', lifecycleStatus: 'trial' }),
  mkLesson('L-ft2-all', 'FT-2', 12 * 60, { durationMinutes: 7 * 60, studentId: 'S-d1' }),
  mkLesson('L-pt1-in', 'PT-1', 14 * 60, { studentId: 'S-z1' }),
  mkLesson('L-pt1-out', 'PT-1', 19 * 60, { studentId: 'S-d1' }),
  mkLesson('L-pt2-out', 'PT-2', 10 * 60, { studentId: 'S-z1' }),
];

/**
 * Paused lessons live in their own cache entry, exactly as production does:
 * the grid only queries gridExtraLifecycles when Paused is selected, so a
 * paused lesson is invisible until it is asked for — and it never contributes
 * occupancy, because it does not hold its slot.
 *
 * FT-3 has no other lesson, which is what makes the row-narrowing provable:
 * the row appears only under Paused.
 */
const pausedLessons = [
  mkLesson('L-ft3-p', 'FT-3', 14 * 60, { studentId: 'S-d1', lifecycleStatus: 'paused' }),
];

/** Mirrors MasterSchedulePage's filter section, legends included. */
function Harness() {
  const { filters, searchQuery } = useScheduleUiStore();

  return (
    <div style={{ padding: 8 }} className="space-y-3">
      <ScheduleFilterBar />
      <ScheduleRosterLegend interactive />
      <ColorLegend interactive />

      <MasterScheduleGrid onEmptyClick={() => {}} onLessonClick={() => {}} onProposeMove={() => {}} />

      {/* The store, projected for assertions — proves the legend and the bar
          are reading and writing one field rather than two. */}
      <div
        data-testid="filter-state"
        data-shift-template-ids={filters.shiftTemplateIds.join(',')}
        data-supervisor-ids={filters.supervisorIds.join(',')}
        data-lifecycle-statuses={filters.lifecycleStatuses.join(',')}
        data-available-only={String(filters.availableOnly)}
        data-outside-shift-only={String(filters.outsideShiftOnly)}
        data-search={searchQuery}
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
queryClient.setQueryData(schedulingKeys.gridExtraLifecycles(DAY, ['paused']), pausedLessons);
queryClient.setQueryData(schedulingKeys.availabilityForDay(DAY), availability);
queryClient.setQueryData(schedulingKeys.exceptionsForDate(nextDateForDayOfWeek(DAY)), []);

useTeacherStore.setState({ teachers } as any);
useSupervisorStore.setState({ supervisors } as any);
// Reset the filters explicitly: the store is a module singleton, and a test
// must never inherit state from whatever ran before it.
useScheduleUiStore.setState({ selectedDay: DAY, searchQuery: '', filters: DEFAULT_FILTERS });

// Advertised to the specs so no test has to hardcode a fixture id.
(window as unknown as Record<string, unknown>).__legendFixtures = {
  fullTemplateId: FULL.id,
  partTemplateId: PART.id,
  dinaId: DINA,
  zainabId: ZAINAB,
  fullTimeTeachers: ['Arwa Ahmed', 'Doaa Zakaria', 'Hend Mohammed'],
  // Who holds what, so no spec hardcodes a fixture name twice.
  dinaTeachers: ['Arwa Ahmed', 'Doaa Zakaria', 'Aya Mustafa'],
  zainabTeachers: ['Arwa Ahmed', 'Aya Mustafa', 'Zainab Hazem'],
  trialTeachers: ['Arwa Ahmed'],
  pausedTeachers: ['Hend Mohammed'],
  partTimeTeachers: ['Aya Mustafa', 'Zainab Hazem'],
};

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}><Harness /></QueryClientProvider>
);

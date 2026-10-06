import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@/index.css';
import i18n from '@/i18n';

import { MemoryRouter } from 'react-router-dom';
import { TeacherWeeklySchedulePage } from '@/features/scheduling/TeacherWeeklySchedulePage';
import { schedulingKeys } from '@/features/scheduling/api/queryKeys';
import { useTeacherStore } from '@/store/teacherStore';
import { useSupervisorStore } from '@/store/supervisorStore';
import { useScheduleUiStore, DEFAULT_FILTERS } from '@/store/scheduleUiStore';
import { nextDateForDayOfWeek } from '@/features/scheduling/utils/nextDateForDayOfWeek';
import type { LessonWithParticipants } from '@/services/scheduling/lessons.service';
import type { DayOfWeek } from '@/lib/types';

/**
 * THE REAL TeacherWeeklySchedulePage, rendered.
 *
 * Not a reassembly of its parts: the point of this harness is the page's own
 * wiring — that it passes `interactive` to both legends, and that its week
 * grid reads the shared filter store rather than a local constant. A harness
 * that rendered the legend and the grid itself would pass even if the page
 * did neither, which is exactly how the gap survived until now.
 *
 * Rows here are DAYS, not teachers, so the behaviour under test differs from
 * the Master Schedule in one deliberate way: all seven days stay on screen
 * even when a filter empties them.
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
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6] as DayOfWeek[];
/** The teacher the week is pinned to — a FULL-TIME teacher, by id not name. */
const WEEKLY_TEACHER = 'FT-1';
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

const availabilityFor = (day: DayOfWeek) => teachers.map((t) => ({
  teacherId: t.id, dayOfWeek: day,
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

/**
 * The pinned teacher's week, deliberately sparse so each filter leaves a
 * DIFFERENT subset of days with lessons — and the days it empties are the
 * ones that must stay on screen anyway.
 *
 *   Sun  Dina,   active        Wed  Zainab, trial
 *   Mon  Zainab, active        Thu  Dina,   paused (fetched on demand only)
 *   Tue  Dina,   active        Fri/Sat  nothing
 */
const WEEK: Record<number, ReturnType<typeof mkLesson>[]> = {
  0: [mkLesson('W-sun', WEEKLY_TEACHER, 13 * 60, { studentId: 'S-d1' })],
  1: [mkLesson('W-mon', WEEKLY_TEACHER, 13 * 60, { studentId: 'S-z1' })],
  2: [mkLesson('W-tue', WEEKLY_TEACHER, 15 * 60, { studentId: 'S-d1' })],
  3: [mkLesson('W-wed', WEEKLY_TEACHER, 13 * 60, { studentId: 'S-z1', lifecycleStatus: 'trial' })],
  4: [],
  5: [],
  6: [],
};
const WEEK_PAUSED: Record<number, ReturnType<typeof mkLesson>[]> = {
  0: [], 1: [], 2: [],
  3: [],
  4: [mkLesson('W-thu-p', WEEKLY_TEACHER, 14 * 60, { studentId: 'S-d1', lifecycleStatus: 'paused' })],
  5: [], 6: [],
};

function Harness() {
  const { filters, searchQuery } = useScheduleUiStore();

  return (
    <MemoryRouter initialEntries={[`/schedule/teacher?teacherId=${WEEKLY_TEACHER}`]}>
      <TeacherWeeklySchedulePage />
      <div
        data-testid="filter-state"
        data-shift-template-ids={filters.shiftTemplateIds.join(',')}
        data-supervisor-ids={filters.supervisorIds.join(',')}
        data-lifecycle-statuses={filters.lifecycleStatuses.join(',')}
        data-teacher-ids={filters.teacherIds.join(',')}
        data-available-only={String(filters.availableOnly)}
        data-outside-shift-only={String(filters.outsideShiftOnly)}
        data-search={searchQuery}
      />
      <div data-testid="ready" />
    </MemoryRouter>
  );
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
queryClient.setQueryData(schedulingKeys.students(), students);
queryClient.setQueryData(schedulingKeys.courses(), []);
queryClient.setQueryData(schedulingKeys.parents(), []);
queryClient.setQueryData(schedulingKeys.studentParents(), []);
queryClient.setQueryData(schedulingKeys.shiftTemplates(), shiftTemplates);
queryClient.setQueryData(schedulingKeys.teacherShiftAssignments(undefined), shiftAssignments);
for (const day of ALL_DAYS) {
  // Only the pinned teacher's own week. The other teachers' lessons would
  // never be drawn here — one teacher, seven day rows — and seeding them on
  // day 0 only would make Sunday behave differently from every other day.
  queryClient.setQueryData(schedulingKeys.grid(day), WEEK[day]);
  queryClient.setQueryData(schedulingKeys.gridExtraLifecycles(day, ['paused']), WEEK_PAUSED[day]);
  queryClient.setQueryData(schedulingKeys.availabilityForDay(day), availabilityFor(day));
  queryClient.setQueryData(schedulingKeys.exceptionsForDate(nextDateForDayOfWeek(day)), []);
}

useTeacherStore.setState({ teachers } as any);
useSupervisorStore.setState({ supervisors } as any);
// Reset the filters explicitly: the store is a module singleton, and a test
// must never inherit state from whatever ran before it.
useScheduleUiStore.setState({ selectedDay: DAY, searchQuery: '', filters: DEFAULT_FILTERS });

/**
 * Lets a spec set a filter the legend cannot reach — `teacherIds` has no chip,
 * but it is exactly the field that must never override this page's pinned
 * teacher, so a test needs a way to put one there.
 */
(window as unknown as Record<string, unknown>).__setFilter = (key: string, value: unknown) =>
  useScheduleUiStore.getState().setFilter(key as never, value as never);

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
  weeklyTeacherId: WEEKLY_TEACHER,
  weeklyTeacherName: 'Arwa Ahmed',
  // Which weekday rows hold a lesson under each filter (0 = Sunday).
  weekDinaDays: [0, 2],
  weekZainabDays: [1, 3],
  weekTrialDays: [3],
  weekActiveDays: [0, 1, 2],
  weekPausedDays: [4],
  partTimeTeachers: ['Aya Mustafa', 'Zainab Hazem'],
};

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}><Harness /></QueryClientProvider>
);

import { create } from 'zustand';
import type { DayOfWeek, TeacherType, LessonLifecycleStatus } from '@/lib/types';

/**
 * Ephemeral UI state only for the Master Schedule — selected day, active
 * filters, search query. Lesson/teacher/student rows are never cached
 * here; that's React Query's job (see useScheduleGrid).
 *
 * This is also THE single source of truth for every schedule filter, which
 * is why both the filter bar and the interactive legends write here rather
 * than holding local state: a legend chip and its filter-bar control are
 * two views of the same field, so they cannot drift apart.
 */
export type LessonGroupFilter = 'group' | 'one_to_one' | null;

export interface ScheduleFilters {
  teacherIds: string[];
  courseIds: string[];
  studentIds: string[];
  coursePendingOnly: boolean;
  teacherType: TeacherType | null;
  /**
   * Roster/shift-group membership, by SHIFT TEMPLATE id — the canonical
   * identity behind "Full-time"/"Part-time". Deliberately NOT `teacherType`:
   * that field records how a teacher is paid/scheduled (hourly blocks vs
   * assigned shifts) and every roster teacher is `shift`, so it cannot
   * separate one shift group from another. Template ids come from the same
   * shift templates buildScheduleRoster groups by, so a renamed, re-timed or
   * newly added group filters correctly with no code change.
   */
  shiftTemplateIds: string[];
  supervisorIds: string[];
  lifecycleStatuses: LessonLifecycleStatus[];
  /**
   * FREE TIME: keep only teachers who really have unsold capacity today —
   * time inside their working window that no lesson covers. A row-level
   * predicate over (availability − all of today's lessons); it never edits
   * the lessons it filters by.
   */
  availableOnly: boolean;
  /**
   * OUTSIDE SHIFT: keep only teachers with a lesson that falls (partly)
   * outside their working window, and show just those lessons. Derived from
   * the canonical availability window, never from the visible grid bounds.
   */
  outsideShiftOnly: boolean;
  primeTimeOnly: boolean;
  groupFilter: LessonGroupFilter;
  timeRangeStart: number | null;
  timeRangeEnd: number | null;
}

export const DEFAULT_FILTERS: ScheduleFilters = {
  teacherIds: [],
  courseIds: [],
  studentIds: [],
  coursePendingOnly: false,
  teacherType: null,
  shiftTemplateIds: [],
  supervisorIds: [],
  lifecycleStatuses: [],
  availableOnly: false,
  outsideShiftOnly: false,
  primeTimeOnly: false,
  groupFilter: null,
  timeRangeStart: null,
  timeRangeEnd: null,
};

/** The multi-select filter fields — the ones that OR within their category. */
type ArrayFilterKey = {
  [K in keyof ScheduleFilters]: ScheduleFilters[K] extends readonly string[] ? K : never;
}[keyof ScheduleFilters];

/**
 * Whether anything is narrowing the schedule right now. Compared field by
 * field against DEFAULT_FILTERS so a filter added later is covered without
 * touching this function.
 */
export function hasActiveFilters(filters: ScheduleFilters): boolean {
  return (Object.keys(DEFAULT_FILTERS) as (keyof ScheduleFilters)[]).some((key) => {
    const value = filters[key];
    const fallback = DEFAULT_FILTERS[key];
    if (Array.isArray(value)) return value.length > 0;
    return value !== fallback;
  });
}

interface ScheduleUiState {
  selectedDay: DayOfWeek;
  setSelectedDay: (day: DayOfWeek) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filters: ScheduleFilters;
  setFilter: <K extends keyof ScheduleFilters>(key: K, value: ScheduleFilters[K]) => void;
  /**
   * Adds/removes one value from a multi-select filter — the OR-within-a-
   * category gesture every legend chip performs. Lives here rather than in
   * each legend so "clicking a chip twice deselects it" has one definition.
   */
  toggleFilterValue: <K extends ArrayFilterKey>(key: K, value: ScheduleFilters[K][number]) => void;
  resetFilters: () => void;
}

function todayAsDayOfWeek(): DayOfWeek {
  return new Date().getDay() as DayOfWeek;
}

export const useScheduleUiStore = create<ScheduleUiState>()((set) => ({
  selectedDay: todayAsDayOfWeek(),
  setSelectedDay: (day) => set({ selectedDay: day }),
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),
  filters: DEFAULT_FILTERS,
  setFilter: (key, value) => set((state) => ({ filters: { ...state.filters, [key]: value } })),
  toggleFilterValue: (key, value) =>
    set((state) => {
      const current = state.filters[key] as string[];
      const next = current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value];
      return { filters: { ...state.filters, [key]: next } };
    }),
  resetFilters: () => set({ filters: DEFAULT_FILTERS }),
}));

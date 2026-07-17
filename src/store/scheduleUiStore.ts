import { create } from 'zustand';
import type { DayOfWeek, TeacherType, LessonLifecycleStatus } from '@/lib/types';

/**
 * Ephemeral UI state only for the Master Schedule — selected day, active
 * filters, search query. Lesson/teacher/student rows are never cached
 * here; that's React Query's job (see useScheduleGrid).
 */
export type LessonGroupFilter = 'group' | 'one_to_one' | null;

export interface ScheduleFilters {
  teacherIds: string[];
  courseIds: string[];
  studentIds: string[];
  coursePendingOnly: boolean;
  teacherType: TeacherType | null;
  supervisorIds: string[];
  lifecycleStatuses: LessonLifecycleStatus[];
  availableOnly: boolean;
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
  supervisorIds: [],
  lifecycleStatuses: [],
  availableOnly: false,
  primeTimeOnly: false,
  groupFilter: null,
  timeRangeStart: null,
  timeRangeEnd: null,
};

interface ScheduleUiState {
  selectedDay: DayOfWeek;
  setSelectedDay: (day: DayOfWeek) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filters: ScheduleFilters;
  setFilter: <K extends keyof ScheduleFilters>(key: K, value: ScheduleFilters[K]) => void;
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
  resetFilters: () => set({ filters: DEFAULT_FILTERS }),
}));

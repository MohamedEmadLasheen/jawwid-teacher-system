import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useScheduleRoster } from './useScheduleRoster';
import { useSupervisorStore } from '@/store/supervisorStore';
import * as lessonsSvc from '@/services/scheduling/lessons.service';
import { DEFAULT_GRID_LIFECYCLES } from '@/services/scheduling/lessons.service';
import * as availabilitySvc from '@/services/scheduling/teacherAvailability.service';
import { useStudents } from './useStudents';
import { useCourses } from './useCourses';
import { schedulingKeys } from '../api/queryKeys';
import { nextDateForDayOfWeek } from '../utils/nextDateForDayOfWeek';
import {
  applyOccurrenceExceptions, deriveScheduleRows, type ScheduleGridTeacherRow,
} from '../utils/deriveScheduleRows';
import type { ScheduleFilters } from '@/store/scheduleUiStore';
import type { DayOfWeek } from '@/lib/types';

export type { ScheduleGridTeacherRow };

/**
 * THE shared hook for a single day's schedule: lessons+participants+
 * availability, joined against teachers/students/courses/supervisors and
 * reduced to one row per visible teacher. Used as-is by the Master Grid
 * today and by the per-teacher weekly view (parametrized by a teacherId
 * filter) — never duplicated.
 *
 * Rows come from useScheduleRoster, i.e. teachers holding an active shift
 * assignment — not every teacher in the academy. A teacher outside the
 * configured roster never appears in the Schedule.
 *
 * The hook's own job is only data plumbing. The pipeline it feeds —
 *
 *   raw lessons → occurrence exceptions → teacher/lesson joins
 *     → filter state → visible rows
 *
 * — lives in utils/deriveScheduleRows as pure functions, so the filter
 * semantics are provable without React and the derived rows stay derived:
 * they are memoized here and never written back into a store.
 */
export function useScheduleGrid(dayOfWeek: number, filters: ScheduleFilters, searchQuery: string) {
  const { rosterTeachers, templateIdsByTeacherId } = useScheduleRoster();
  const { supervisors } = useSupervisorStore();
  const { data: students = [] } = useStudents();
  const { data: courses = [] } = useCourses();

  const occurrenceDate = nextDateForDayOfWeek(dayOfWeek as DayOfWeek);

  // The booked set. Always the default lifecycles, never filter-dependent:
  // this is the shared cache entry useTeacherDaySlots reads to judge capacity,
  // and a filter must not be able to change what counts as booked.
  const lessonsQuery = useQuery({
    queryKey: schedulingKeys.grid(dayOfWeek),
    queryFn: () => lessonsSvc.fetchLessonsForDay(dayOfWeek),
  });

  /**
   * Statuses the user asked for that the grid does not load by default —
   * today that means `paused`. Empty unless one is actually selected, so
   * nothing extra is ever fetched just to be hidden again.
   */
  const extraLifecycles = useMemo(
    () => filters.lifecycleStatuses.filter((s) => !DEFAULT_GRID_LIFECYCLES.includes(s)),
    [filters.lifecycleStatuses]
  );
  const extraLessonsQuery = useQuery({
    queryKey: schedulingKeys.gridExtraLifecycles(dayOfWeek, extraLifecycles),
    queryFn: () => lessonsSvc.fetchLessonsForDay(dayOfWeek, extraLifecycles),
    enabled: extraLifecycles.length > 0,
  });
  const availabilityQuery = useQuery({
    queryKey: schedulingKeys.availabilityForDay(dayOfWeek),
    queryFn: () => availabilitySvc.fetchUnifiedAvailabilityForDay(dayOfWeek),
  });
  const exceptionsQuery = useQuery({
    queryKey: schedulingKeys.exceptionsForDate(occurrenceDate),
    queryFn: () => lessonsSvc.fetchExceptionsForDate(occurrenceDate),
  });

  const rows = useMemo<ScheduleGridTeacherRow[]>(() => {
    // Apply today's occurrence-scoped deviations (cancel/reschedule) first, so
    // every filter below — free capacity included — sees the day as it will
    // actually be taught rather than the recurring shape.
    const exceptions = exceptionsQuery.data ?? [];
    const booked = applyOccurrenceExceptions(lessonsQuery.data ?? [], exceptions);
    const extra = applyOccurrenceExceptions(extraLessonsQuery.data ?? [], exceptions);

    return deriveScheduleRows({
      rosterTeachers,
      // Drawable = the booked set plus whatever extra lifecycle was asked for.
      lessons: extra.length > 0 ? [...booked, ...extra] : booked,
      // Occupancy stays the booked set alone: a paused lesson is visible when
      // asked for, but it does not hold its slot, so it must not change the
      // free-capacity bands.
      occupancyLessons: booked,
      availability: availabilityQuery.data ?? [],
      supervisorIdByStudentId: new Map(students.map((s) => [s.id, s.supervisorId])),
      studentNameById: new Map(students.map((s) => [s.id, s.fullName])),
      templateIdsByTeacherId,
      filters,
      searchQuery,
    });
  }, [
    rosterTeachers, templateIdsByTeacherId, students,
    lessonsQuery.data, extraLessonsQuery.data, availabilityQuery.data, exceptionsQuery.data,
    filters, searchQuery,
  ]);

  return {
    rows,
    courses,
    supervisors,
    isLoading: lessonsQuery.isLoading || availabilityQuery.isLoading || exceptionsQuery.isLoading
      || (extraLifecycles.length > 0 && extraLessonsQuery.isLoading),
    error: lessonsQuery.error || extraLessonsQuery.error || availabilityQuery.error || exceptionsQuery.error,
  };
}

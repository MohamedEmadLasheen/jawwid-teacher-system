import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import * as lessonsSvc from '@/services/scheduling/lessons.service';
import { schedulingKeys } from '../api/queryKeys';
import { useStoredLessons } from './useStoredLessons';
import { DAYS_OF_WEEK } from '../constants/schedulingConstants';
import { nextDateForDayOfWeek } from '../utils/nextDateForDayOfWeek';
import { findStudentWeeklyLessons, type StudentWeeklyEntry } from '../utils/studentWeeklySchedule';
import type { DayOfWeek } from '@/lib/types';

/**
 * One student's complete live recurring weekly schedule, each row paired with
 * the exception (if any) affecting its next occurrence.
 *
 * Two layers, kept apart on purpose:
 *
 *   the recurring lessons   from the stored lessons table (useStoredLessons),
 *                           never the grid's occurrence-overlaid copies.
 *   the occurrence state    one lesson_exceptions read per weekday, for the
 *                           next date that weekday falls on.
 *
 * The exception is attached as an annotation, never folded into the lesson,
 * so a reschedule or cancellation cannot be mistaken for a permanent change.
 *
 * Seven dated reads rather than one range query: that is the existing service
 * (fetchExceptionsForDate) under the existing key (schedulingKeys
 * .exceptionsForDate), so no new service or endpoint is introduced, they run
 * in parallel, they cache independently, and the day the grid is showing is
 * usually already among them.
 *
 * `isLoading` covers the lessons join only. Exceptions resolve separately and
 * their markers appear when they arrive — the absence of a marker while
 * `exceptionsLoading` is true is "not known yet", not "not cancelled", and
 * callers should not present it as the latter.
 */
export function useStudentWeeklySchedule(studentId: string | null) {
  const { lessons: storedLessons, byId, isLoading: lessonsLoading } = useStoredLessons();

  /** The next calendar date for each weekday — the dates the markers describe. */
  const occurrenceDates = useMemo(
    () => DAYS_OF_WEEK.map((d) => nextDateForDayOfWeek(d.value as DayOfWeek)),
    []
  );

  const exceptionQueries = useQueries({
    queries: occurrenceDates.map((date) => ({
      queryKey: schedulingKeys.exceptionsForDate(date),
      queryFn: () => lessonsSvc.fetchExceptionsForDate(date),
      enabled: !!studentId,
    })),
  });

  const exceptionsLoading = exceptionQueries.some((q) => q.isLoading);

  /** date → (lessonId → exception) */
  const exceptionsByDate = useMemo(() => {
    const out = new Map<string, Map<string, lessonsSvc.LessonExceptionOverride>>();
    occurrenceDates.forEach((date, i) => {
      const rows = exceptionQueries[i]?.data ?? [];
      out.set(date, new Map(rows.map((r) => [r.lessonId, r])));
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [occurrenceDates, exceptionQueries.map((q) => q.data)]);

  const entries = useMemo<StudentWeeklyEntry[]>(() => {
    if (!studentId) return [];
    return findStudentWeeklyLessons(studentId, storedLessons).map((lesson) => {
      const occurrenceDate = occurrenceDates[lesson.dayOfWeek];
      const exc = exceptionsByDate.get(occurrenceDate)?.get(lesson.id);
      return {
        lesson,
        occurrenceDate,
        occurrenceException: exc
          ? {
              status: exc.status,
              overrideTeacherId: exc.overrideTeacherId,
              overrideStartMinute: exc.overrideStartMinute,
              overrideDurationMinutes: exc.overrideDurationMinutes,
            }
          : null,
      };
    });
  }, [studentId, storedLessons, occurrenceDates, exceptionsByDate]);

  return {
    entries,
    /** Stored record by id — lets a caller un-overlay a clicked lesson. */
    byId,
    isLoading: lessonsLoading,
    exceptionsLoading,
  };
}

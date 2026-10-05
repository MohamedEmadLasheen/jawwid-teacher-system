import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useScheduleRoster } from './useScheduleRoster';
import { useSupervisorStore } from '@/store/supervisorStore';
import * as lessonsSvc from '@/services/scheduling/lessons.service';
import * as availabilitySvc from '@/services/scheduling/teacherAvailability.service';
import { useStudents } from './useStudents';
import { useCourses } from './useCourses';
import { schedulingKeys } from '../api/queryKeys';
import { nextDateForDayOfWeek } from '../utils/nextDateForDayOfWeek';
import { overlapsPrimeTime } from '../utils/primeTime';
import type { ScheduleFilters } from '@/store/scheduleUiStore';
import type { DayOfWeek, Teacher } from '@/lib/types';
import type { LessonWithParticipants } from '@/services/scheduling/lessons.service';
import type { UnifiedAvailabilitySlot } from '@/services/scheduling/teacherAvailability.service';

export interface ScheduleGridTeacherRow {
  teacher: Teacher;
  availability: UnifiedAvailabilitySlot[];
  lessons: LessonWithParticipants[];
}

/**
 * THE shared hook for a single day's schedule: lessons+participants+
 * availability, joined against teachers/students/courses/supervisors and
 * reduced to one row per visible teacher. Used as-is by the Master Grid
 * today and by the future per-teacher view (parametrized by teacherId
 * filter) — never duplicated.
 *
 * Rows come from useScheduleRoster, i.e. teachers holding an active shift
 * assignment — not every teacher in the academy. A teacher outside the
 * configured roster never appears in the Schedule.
 */
export function useScheduleGrid(dayOfWeek: number, filters: ScheduleFilters, searchQuery: string) {
  const { rosterTeachers } = useScheduleRoster();
  const { supervisors } = useSupervisorStore();
  const { data: students = [] } = useStudents();
  const { data: courses = [] } = useCourses();

  const occurrenceDate = nextDateForDayOfWeek(dayOfWeek as DayOfWeek);

  const lessonsQuery = useQuery({
    queryKey: schedulingKeys.grid(dayOfWeek),
    queryFn: () => lessonsSvc.fetchLessonsForDay(dayOfWeek),
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
    const rawLessons = lessonsQuery.data ?? [];
    const availability = availabilityQuery.data ?? [];
    const exceptions = exceptionsQuery.data ?? [];
    const search = searchQuery.trim().toLowerCase();

    // Apply today's occurrence-scoped deviations (cancel/reschedule) so a
    // "this occurrence" change — which only ever writes a lesson_exceptions
    // row, never the recurring lessons row — is actually visible in the grid.
    const exceptionByLessonId = new Map(exceptions.map((e) => [e.lessonId, e]));
    const lessons = rawLessons
      .filter((l) => exceptionByLessonId.get(l.id)?.status !== 'cancelled')
      .map((l) => {
        const exc = exceptionByLessonId.get(l.id);
        if (exc?.status !== 'rescheduled') return l;
        const startMinute = exc.overrideStartMinute ?? l.startMinute;
        const durationMinutes = exc.overrideDurationMinutes ?? l.durationMinutes;
        return {
          ...l,
          teacherId: exc.overrideTeacherId ?? l.teacherId,
          startMinute,
          durationMinutes,
          endMinute: startMinute + durationMinutes,
        };
      });

    const studentNameById = new Map(students.map((s) => [s.id, s.fullName]));

    // The grid shows the Schedule roster — teachers with an active shift
    // assignment — in roster order, never every teacher in the academy.
    // Membership comes from the availability configuration, so nothing here
    // enumerates who belongs; `rosterTeachers` is already ordered.
    return rosterTeachers
      .filter((t) => !t.isDeleted)
      .filter((t) => filters.teacherIds.length === 0 || filters.teacherIds.includes(t.id))
      .filter((t) => !filters.teacherType || t.teacherType === filters.teacherType)
      .map((teacher) => {
        let teacherLessons = lessons.filter((l) => l.teacherId === teacher.id);

        if (filters.coursePendingOnly) {
          teacherLessons = teacherLessons.filter((l) => !l.courseId);
        } else if (filters.courseIds.length > 0) {
          teacherLessons = teacherLessons.filter((l) => l.courseId && filters.courseIds.includes(l.courseId));
        }
        if (filters.lifecycleStatuses.length > 0) {
          teacherLessons = teacherLessons.filter((l) => filters.lifecycleStatuses.includes(l.lifecycleStatus));
        }
        if (filters.supervisorIds.length > 0) {
          teacherLessons = teacherLessons.filter((l) =>
            l.participants.some((p) => {
              const supId = students.find((s) => s.id === p.studentId)?.supervisorId;
              return supId && filters.supervisorIds.includes(supId);
            })
          );
        }
        if (filters.studentIds.length > 0) {
          teacherLessons = teacherLessons.filter((l) =>
            l.participants.some((p) => filters.studentIds.includes(p.studentId))
          );
        }
        if (filters.availableOnly) {
          teacherLessons = [];
        }
        if (filters.primeTimeOnly) {
          teacherLessons = teacherLessons.filter((l) => overlapsPrimeTime(l.startMinute, l.durationMinutes));
        }
        if (filters.groupFilter === 'group') {
          teacherLessons = teacherLessons.filter((l) => l.participants.length > 1);
        } else if (filters.groupFilter === 'one_to_one') {
          teacherLessons = teacherLessons.filter((l) => l.participants.length <= 1);
        }
        if (filters.timeRangeStart !== null) {
          teacherLessons = teacherLessons.filter((l) => l.startMinute >= filters.timeRangeStart!);
        }
        if (filters.timeRangeEnd !== null) {
          teacherLessons = teacherLessons.filter((l) => l.startMinute + l.durationMinutes <= filters.timeRangeEnd!);
        }

        return {
          teacher,
          availability: availability.filter((a) => a.teacherId === teacher.id),
          lessons: teacherLessons,
        };
      })
      .filter((row) => {
        if (!search) return true;
        if (row.teacher.fullName.toLowerCase().includes(search)) return true;
        return row.lessons.some((l) =>
          l.participants.some((p) => (studentNameById.get(p.studentId) ?? '').toLowerCase().includes(search))
        );
      });
  }, [rosterTeachers, students, lessonsQuery.data, availabilityQuery.data, exceptionsQuery.data, filters, searchQuery]);

  return {
    rows,
    courses,
    supervisors,
    isLoading: lessonsQuery.isLoading || availabilityQuery.isLoading || exceptionsQuery.isLoading,
    error: lessonsQuery.error || availabilityQuery.error || exceptionsQuery.error,
  };
}

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTeacherStore } from '@/store/teacherStore';
import { useStudents } from './useStudents';
import { useCourses } from './useCourses';
import * as lessonsSvc from '@/services/scheduling/lessons.service';
import * as availabilitySvc from '@/services/scheduling/teacherAvailability.service';
import { computeAcademyHealth } from '../utils/academyHealth';
import { computeScheduleHealthScore } from '../utils/scheduleHealthScore';

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

/** The one query set behind the whole Intelligence Center — 7x lessons-per-day
 * and 7x availability-per-day (same calls TeacherWeekGrid/useScheduleGrid
 * already make elsewhere, just fetched once academy-wide here) plus one
 * exceptions query. Pure computeAcademyHealth() does all the math. */
export function useAcademyHealth() {
  const { teachers } = useTeacherStore();
  const { data: students = [], isLoading: studentsLoading } = useStudents();
  const { data: courses = [], isLoading: coursesLoading } = useCourses();

  const lessonsQuery = useQuery({
    queryKey: ['scheduling', 'academyHealth', 'allLessons'],
    queryFn: async () => (await Promise.all(ALL_DAYS.map((d) => lessonsSvc.fetchLessonsForDay(d)))).flat(),
  });
  const availabilityQuery = useQuery({
    queryKey: ['scheduling', 'academyHealth', 'allAvailability'],
    queryFn: async () => (await Promise.all(ALL_DAYS.map((d) => availabilitySvc.fetchUnifiedAvailabilityForDay(d)))).flat(),
  });
  const exceptionsQuery = useQuery({
    queryKey: ['scheduling', 'academyHealth', 'allExceptions'],
    queryFn: lessonsSvc.fetchAllExceptions,
  });

  const isLoading = studentsLoading || coursesLoading || lessonsQuery.isLoading || availabilityQuery.isLoading || exceptionsQuery.isLoading;

  const health = useMemo(() => {
    if (isLoading) return null;
    return computeAcademyHealth({
      teachers,
      students,
      courses,
      allLessons: lessonsQuery.data ?? [],
      allAvailability: availabilityQuery.data ?? [],
      allExceptions: exceptionsQuery.data ?? [],
      todayDayOfWeek: new Date().getDay(),
    });
  }, [isLoading, teachers, students, courses, lessonsQuery.data, availabilityQuery.data, exceptionsQuery.data]);

  const scoreResult = useMemo(() => (health ? computeScheduleHealthScore(health) : null), [health]);

  return {
    isLoading,
    error: lessonsQuery.error || availabilityQuery.error || exceptionsQuery.error,
    health,
    scoreResult,
    // Already-fetched (no extra query) — reused by Tomorrow Risk to look at a specific
    // day (e.g. tomorrow) instead of the weekly aggregates in `health` above.
    allLessons: lessonsQuery.data ?? [],
  };
}

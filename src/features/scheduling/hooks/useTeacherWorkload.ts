import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLessons } from './useLessons';
import * as availabilitySvc from '@/services/scheduling/teacherAvailability.service';
import * as lessonsSvc from '@/services/scheduling/lessons.service';
import { computeTeacherWorkload } from '../utils/teacherWorkload';

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

/** Reuses useLessons() (already fetches all lessons app-wide) filtered to
 * one teacher, plus the same v_teacher_availability_unified view every
 * other availability-vs-booked calculation in the app reads (health
 * metrics, grid) — not the hourly-only table, so shift-type teachers are
 * counted correctly too. */
export function useTeacherWorkload(teacherId: string) {
  const { data: allLessons = [], isLoading: lessonsLoading } = useLessons();
  const teacherLessons = useMemo(() => allLessons.filter((l) => l.teacherId === teacherId), [allLessons, teacherId]);
  const lessonIds = useMemo(() => teacherLessons.map((l) => l.id), [teacherLessons]);

  const availabilityQuery = useQuery({
    queryKey: ['scheduling', 'unifiedAvailabilityAllDays', teacherId],
    queryFn: async () => {
      const perDay = await Promise.all(ALL_DAYS.map((d) => availabilitySvc.fetchUnifiedAvailabilityForDay(d)));
      return perDay.flat().filter((a) => a.teacherId === teacherId);
    },
  });

  const exceptionsQuery = useQuery({
    queryKey: ['scheduling', 'exceptionStatusCounts', teacherId, lessonIds],
    queryFn: () => lessonsSvc.fetchExceptionStatusCounts(lessonIds),
    enabled: lessonIds.length > 0,
  });

  const metrics = useMemo(
    () => computeTeacherWorkload(teacherLessons, availabilityQuery.data ?? [], exceptionsQuery.data ?? []),
    [teacherLessons, availabilityQuery.data, exceptionsQuery.data]
  );

  return {
    metrics,
    isLoading: lessonsLoading || availabilityQuery.isLoading || exceptionsQuery.isLoading,
  };
}

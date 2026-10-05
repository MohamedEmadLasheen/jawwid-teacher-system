import { useQuery } from '@tanstack/react-query';
import * as lessonsSvc from '@/services/scheduling/lessons.service';
import * as availabilitySvc from '@/services/scheduling/teacherAvailability.service';
import { schedulingKeys } from '../api/queryKeys';
import type { LessonWithParticipants } from '@/services/scheduling/lessons.service';
import type { UnifiedAvailabilitySlot } from '@/services/scheduling/teacherAvailability.service';

/**
 * One teacher's UNFILTERED availability and lessons for a day.
 *
 * Deliberately not read off useScheduleGrid's rows: those rows have the UI's
 * filters and search applied, and a lesson hidden by a filter would make an
 * occupied slot look free in the time picker. Capacity has to be computed
 * against everything that is actually booked, not against what is on screen.
 *
 * It introduces no new request: both queries use the same keys and service
 * functions useScheduleGrid already populates (schedulingKeys.grid and
 * .availabilityForDay), so react-query serves them from the same cache
 * entries the grid filled.
 */
export function useTeacherDaySlots(teacherId: string, dayOfWeek: number) {
  const lessonsQuery = useQuery({
    queryKey: schedulingKeys.grid(dayOfWeek),
    queryFn: () => lessonsSvc.fetchLessonsForDay(dayOfWeek),
  });
  const availabilityQuery = useQuery({
    queryKey: schedulingKeys.availabilityForDay(dayOfWeek),
    queryFn: () => availabilitySvc.fetchUnifiedAvailabilityForDay(dayOfWeek),
  });

  const lessons: LessonWithParticipants[] = (lessonsQuery.data ?? []).filter(
    (l) => l.teacherId === teacherId
  );
  const availability: UnifiedAvailabilitySlot[] = (availabilityQuery.data ?? []).filter(
    (a) => a.teacherId === teacherId
  );

  return {
    lessons,
    availability,
    isLoading: lessonsQuery.isLoading || availabilityQuery.isLoading,
  };
}

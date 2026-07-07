import { useQuery } from '@tanstack/react-query';
import * as lessonsSvc from '@/services/scheduling/lessons.service';
import { schedulingKeys } from '../api/queryKeys';

export function useLessons() {
  return useQuery({
    queryKey: schedulingKeys.lessons(),
    queryFn: lessonsSvc.fetchLessons,
  });
}

export function useLessonParticipants() {
  return useQuery({
    queryKey: schedulingKeys.lessonParticipants(),
    queryFn: lessonsSvc.fetchLessonParticipants,
  });
}

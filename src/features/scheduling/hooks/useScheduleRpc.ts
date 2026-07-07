import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as rpcSvc from '@/services/scheduling/scheduleRpc.service';
import { schedulingKeys } from '../api/queryKeys';

export function useCheckScheduleConflict() {
  return useMutation({
    mutationFn: (params: {
      teacherId: string;
      studentIds: string[];
      dayOfWeek: number;
      startMinute: number;
      durationMinutes: number;
      excludeLessonId?: string;
    }) => rpcSvc.checkScheduleConflict(params),
  });
}

export function useApplyScheduleChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ action, payload }: { action: string; payload: Record<string, unknown> }) =>
      rpcSvc.applyScheduleChange(action, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: schedulingKeys.lessons() });
      queryClient.invalidateQueries({ queryKey: schedulingKeys.lessonParticipants() });
    },
  });
}

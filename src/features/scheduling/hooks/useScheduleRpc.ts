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
      // The grid/exceptions queries are keyed by day/date (schedulingKeys.grid(dayOfWeek),
      // .exceptionsForDate(date)), not under .lessons()/.lessonParticipants() — invalidating
      // only those wouldn't actually refetch what the grid renders. Invalidate everything
      // under the scheduling key so every affected view (any day, health panel) refetches.
      queryClient.invalidateQueries({ queryKey: schedulingKeys.all });
    },
  });
}

import { useQuery } from '@tanstack/react-query';
import * as rpcSvc from '@/services/scheduling/scheduleRpc.service';
import { schedulingKeys } from '../api/queryKeys';

export function useTeacherPreservationScore(lessonId: string | undefined) {
  return useQuery({
    queryKey: schedulingKeys.preservationScore(lessonId ?? ''),
    queryFn: () => rpcSvc.getTeacherPreservationScore(lessonId!),
    enabled: !!lessonId,
  });
}

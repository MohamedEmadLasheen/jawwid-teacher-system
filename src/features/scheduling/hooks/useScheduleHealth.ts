import { useQuery } from '@tanstack/react-query';
import * as rpcSvc from '@/services/scheduling/scheduleRpc.service';
import { schedulingKeys } from '../api/queryKeys';

export function useScheduleHealth() {
  return useQuery({
    queryKey: schedulingKeys.health(),
    queryFn: rpcSvc.getScheduleHealthMetrics,
  });
}

import { useQuery } from '@tanstack/react-query';
import * as rpcSvc from '@/services/scheduling/scheduleRpc.service';
import { schedulingKeys } from '../api/queryKeys';

/** Proactive active schedule conflicts — set-based DB scan (get_active_schedule_conflicts), read once and cached. */
export function useActiveScheduleConflicts() {
  return useQuery({
    queryKey: schedulingKeys.activeConflicts(),
    queryFn: rpcSvc.getActiveScheduleConflicts,
  });
}

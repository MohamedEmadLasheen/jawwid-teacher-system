import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as svc from '@/services/operations/lessonSessionReports.service';
import { operationsKeys } from '../api/queryKeys';

/** All recorded outcomes for one lesson slot + student, most recent first. */
export function useSessionReportsForLessonParticipant(lessonParticipantId: string | undefined) {
  return useQuery({
    queryKey: operationsKeys.sessionReports(lessonParticipantId ?? ''),
    queryFn: () => svc.fetchSessionReportsForLessonParticipant(lessonParticipantId as string),
    enabled: !!lessonParticipantId,
  });
}

/** All reports for a whole lesson's participants in one query — used by the
 * Mark Attendance section so a group lesson doesn't fire one query per student. */
export function useSessionReportsForLesson(lessonParticipantIds: string[]) {
  const key = [...lessonParticipantIds].sort();
  return useQuery({
    queryKey: operationsKeys.sessionReportsForLesson(key),
    queryFn: () => svc.fetchSessionReportsForLessonParticipants(key),
    enabled: key.length > 0,
  });
}

/** Records one session's outcome (Mark Attendance). Invalidates every
 * operations query rather than one specific key — the dataset here is small
 * and this keeps the mutation correct without having to track every place
 * a report might be read from as more Operations screens are added later. */
export function useCreateSessionReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: svc.createSessionReport,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: operationsKeys.all });
    },
  });
}

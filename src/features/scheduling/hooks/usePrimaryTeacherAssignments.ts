import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as svc from '@/services/scheduling/primaryTeacherAssignments.service';
import { schedulingKeys } from '../api/queryKeys';

export function usePrimaryTeacherInferenceReport() {
  return useQuery({
    queryKey: schedulingKeys.primaryTeacherInference(),
    queryFn: svc.fetchPrimaryTeacherInferenceReport,
  });
}

/** Task D — confirmed current primary teacher per student, for the given set of
 * students (typically one lesson's participants). Read-only; used only to
 * prioritize/label an existing teacher, never to auto-assign one. */
export function useCurrentPrimaryTeachers(studentIds: string[]) {
  const key = [...studentIds].sort();
  return useQuery({
    queryKey: schedulingKeys.currentPrimaryTeachers(key),
    queryFn: () => svc.fetchCurrentPrimaryTeachersByStudentIds(key),
    enabled: key.length > 0,
  });
}

/** The only mutation that can create a confirmed student_teacher_assignments row —
 * always from explicit human action in the Primary Teacher Review page. */
export function useConfirmPrimaryTeacherAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: svc.confirmPrimaryTeacherAssignment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: schedulingKeys.primaryTeacherInference() });
      // Prefix-match invalidates every useCurrentPrimaryTeachers(studentIds) query regardless
      // of which specific student-id set it was keyed on — without this, LessonDetailDialog's
      // "Change Teacher" list keeps serving whatever it had cached before this confirmation.
      queryClient.invalidateQueries({ queryKey: [...schedulingKeys.all, 'currentPrimaryTeachers'] });
    },
  });
}

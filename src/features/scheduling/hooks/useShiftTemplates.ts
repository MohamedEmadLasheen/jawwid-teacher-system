import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as shiftSvc from '@/services/scheduling/shiftTemplates.service';
import type { ShiftTemplate, TeacherShiftAssignment } from '@/lib/types';
import { schedulingKeys } from '../api/queryKeys';

export function useShiftTemplates() {
  return useQuery({
    queryKey: schedulingKeys.shiftTemplates(),
    queryFn: shiftSvc.fetchShiftTemplates,
  });
}

export function useCreateShiftTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (template: Omit<ShiftTemplate, 'id' | 'createdAt' | 'updatedAt'>) =>
      shiftSvc.createShiftTemplate(template),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: schedulingKeys.shiftTemplates() }),
  });
}

export function useUpdateShiftTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<ShiftTemplate> }) =>
      shiftSvc.updateShiftTemplate(id, updates),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: schedulingKeys.shiftTemplates() }),
  });
}

export function useDeleteShiftTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => shiftSvc.deleteShiftTemplate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: schedulingKeys.shiftTemplates() }),
  });
}

export function useTeacherShiftAssignments(teacherId?: string) {
  return useQuery({
    queryKey: schedulingKeys.teacherShiftAssignments(teacherId),
    queryFn: () => shiftSvc.fetchTeacherShiftAssignments(teacherId),
  });
}

export function useAssignTeacherShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (assignment: Omit<TeacherShiftAssignment, 'id' | 'createdAt' | 'updatedAt' | 'isActive'>) =>
      shiftSvc.assignTeacherShift(assignment),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: schedulingKeys.teacherShiftAssignments(variables.teacherId) });
      queryClient.invalidateQueries({ queryKey: schedulingKeys.teacherShiftAssignments() });
    },
  });
}

export function useUnassignTeacherShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => shiftSvc.unassignTeacherShift(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: schedulingKeys.all }),
  });
}

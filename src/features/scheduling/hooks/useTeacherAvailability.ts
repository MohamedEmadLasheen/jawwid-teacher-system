import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as availabilitySvc from '@/services/scheduling/teacherAvailability.service';
import type { TeacherAvailability } from '@/lib/types';
import { schedulingKeys } from '../api/queryKeys';

export function useTeacherAvailability(teacherId?: string) {
  return useQuery({
    queryKey: schedulingKeys.teacherAvailability(teacherId),
    queryFn: () => availabilitySvc.fetchTeacherAvailability(teacherId),
  });
}

export function useCreateTeacherAvailability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (block: Omit<TeacherAvailability, 'id' | 'createdAt' | 'updatedAt' | 'isActive'>) =>
      availabilitySvc.createTeacherAvailability(block),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: schedulingKeys.teacherAvailability(variables.teacherId) });
      queryClient.invalidateQueries({ queryKey: schedulingKeys.teacherAvailability() });
    },
  });
}

export function useDeleteTeacherAvailability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => availabilitySvc.deleteTeacherAvailability(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: schedulingKeys.all }),
  });
}

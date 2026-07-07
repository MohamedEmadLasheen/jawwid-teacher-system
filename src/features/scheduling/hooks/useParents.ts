import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as parentsSvc from '@/services/scheduling/parents.service';
import type { Parent, StudentParent } from '@/lib/types';
import { schedulingKeys } from '../api/queryKeys';

export function useParents() {
  return useQuery({
    queryKey: schedulingKeys.parents(),
    queryFn: parentsSvc.fetchParents,
  });
}

export function useStudentParents() {
  return useQuery({
    queryKey: schedulingKeys.studentParents(),
    queryFn: parentsSvc.fetchStudentParents,
  });
}

export function useCreateParent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (parent: Omit<Parent, 'id' | 'createdAt' | 'updatedAt' | 'isDeleted'>) =>
      parentsSvc.createParent(parent),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: schedulingKeys.parents() }),
  });
}

export function useUpdateParent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Parent> }) =>
      parentsSvc.updateParent(id, updates),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: schedulingKeys.parents() }),
  });
}

export function useSoftDeleteParent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => parentsSvc.softDeleteParent(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: schedulingKeys.parents() }),
  });
}

export function useRestoreParent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => parentsSvc.restoreParent(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: schedulingKeys.parents() }),
  });
}

export function useLinkStudentParent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (link: {
      studentId: string;
      parentId: string;
      relationship: StudentParent['relationship'];
      isPrimaryContact: boolean;
    }) => parentsSvc.linkStudentParent(link),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: schedulingKeys.studentParents() }),
  });
}

export function useUnlinkStudentParent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => parentsSvc.unlinkStudentParent(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: schedulingKeys.studentParents() }),
  });
}

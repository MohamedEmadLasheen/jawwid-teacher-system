import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as studentsSvc from '@/services/scheduling/students.service';
import type { Student } from '@/lib/types';
import { schedulingKeys } from '../api/queryKeys';

export function useStudents() {
  return useQuery({
    queryKey: schedulingKeys.students(),
    queryFn: studentsSvc.fetchStudents,
  });
}

export function useCreateStudent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (student: Omit<Student, 'id' | 'createdAt' | 'updatedAt' | 'isDeleted'>) =>
      studentsSvc.createStudent(student),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: schedulingKeys.students() }),
  });
}

export function useUpdateStudent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Student> }) =>
      studentsSvc.updateStudent(id, updates),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: schedulingKeys.students() }),
  });
}

export function useSoftDeleteStudent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => studentsSvc.softDeleteStudent(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: schedulingKeys.students() }),
  });
}

export function useRestoreStudent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => studentsSvc.restoreStudent(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: schedulingKeys.students() }),
  });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as coursesSvc from '@/services/scheduling/courses.service';
import type { Course } from '@/lib/types';
import { schedulingKeys } from '../api/queryKeys';

export function useCourses() {
  return useQuery({
    queryKey: schedulingKeys.courses(),
    queryFn: coursesSvc.fetchCourses,
  });
}

export function useCreateCourse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (course: Omit<Course, 'id' | 'createdAt' | 'updatedAt'>) =>
      coursesSvc.createCourse(course),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: schedulingKeys.courses() }),
  });
}

export function useUpdateCourse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Course> }) =>
      coursesSvc.updateCourse(id, updates),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: schedulingKeys.courses() }),
  });
}

export function useDeleteCourse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => coursesSvc.deleteCourse(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: schedulingKeys.courses() }),
  });
}

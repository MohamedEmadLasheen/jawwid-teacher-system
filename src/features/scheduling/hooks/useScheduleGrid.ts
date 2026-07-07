import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTeacherStore } from '@/store/teacherStore';
import { useSupervisorStore } from '@/store/supervisorStore';
import * as lessonsSvc from '@/services/scheduling/lessons.service';
import * as availabilitySvc from '@/services/scheduling/teacherAvailability.service';
import { useStudents } from './useStudents';
import { useCourses } from './useCourses';
import { schedulingKeys } from '../api/queryKeys';
import type { ScheduleFilters } from '@/store/scheduleUiStore';
import type { Teacher } from '@/lib/types';
import type { LessonWithParticipants } from '@/services/scheduling/lessons.service';
import type { UnifiedAvailabilitySlot } from '@/services/scheduling/teacherAvailability.service';

export interface ScheduleGridTeacherRow {
  teacher: Teacher;
  availability: UnifiedAvailabilitySlot[];
  lessons: LessonWithParticipants[];
}

/**
 * THE shared hook for a single day's schedule: lessons+participants+
 * availability, joined against teachers/students/courses/supervisors and
 * reduced to one row per visible teacher. Used as-is by the Master Grid
 * today and by the future per-teacher view (parametrized by teacherId
 * filter) — never duplicated.
 */
export function useScheduleGrid(dayOfWeek: number, filters: ScheduleFilters, searchQuery: string) {
  const { teachers } = useTeacherStore();
  const { supervisors } = useSupervisorStore();
  const { data: students = [] } = useStudents();
  const { data: courses = [] } = useCourses();

  const lessonsQuery = useQuery({
    queryKey: schedulingKeys.grid(dayOfWeek),
    queryFn: () => lessonsSvc.fetchLessonsForDay(dayOfWeek),
  });
  const availabilityQuery = useQuery({
    queryKey: schedulingKeys.availabilityForDay(dayOfWeek),
    queryFn: () => availabilitySvc.fetchUnifiedAvailabilityForDay(dayOfWeek),
  });

  const rows = useMemo<ScheduleGridTeacherRow[]>(() => {
    const lessons = lessonsQuery.data ?? [];
    const availability = availabilityQuery.data ?? [];
    const search = searchQuery.trim().toLowerCase();

    const studentNameById = new Map(students.map((s) => [s.id, s.fullName]));

    return teachers
      .filter((t) => !t.isDeleted)
      .filter((t) => !filters.teacherId || t.id === filters.teacherId)
      .filter((t) => !filters.teacherType || t.teacherType === filters.teacherType)
      .map((teacher) => {
        let teacherLessons = lessons.filter((l) => l.teacherId === teacher.id);

        if (filters.coursePendingOnly) {
          teacherLessons = teacherLessons.filter((l) => !l.courseId);
        } else if (filters.courseId) {
          teacherLessons = teacherLessons.filter((l) => l.courseId === filters.courseId);
        }
        if (filters.lifecycleStatus) {
          teacherLessons = teacherLessons.filter((l) => l.lifecycleStatus === filters.lifecycleStatus);
        }
        if (filters.supervisorId) {
          teacherLessons = teacherLessons.filter((l) =>
            l.participants.some((p) => students.find((s) => s.id === p.studentId)?.supervisorId === filters.supervisorId)
          );
        }
        if (filters.availableOnly) {
          teacherLessons = [];
        }

        return {
          teacher,
          availability: availability.filter((a) => a.teacherId === teacher.id),
          lessons: teacherLessons,
        };
      })
      .filter((row) => {
        if (!search) return true;
        if (row.teacher.fullName.toLowerCase().includes(search)) return true;
        return row.lessons.some((l) =>
          l.participants.some((p) => (studentNameById.get(p.studentId) ?? '').toLowerCase().includes(search))
        );
      });
  }, [teachers, students, lessonsQuery.data, availabilityQuery.data, filters, searchQuery]);

  return {
    rows,
    courses,
    supervisors,
    isLoading: lessonsQuery.isLoading || availabilityQuery.isLoading,
    error: lessonsQuery.error || availabilityQuery.error,
  };
}

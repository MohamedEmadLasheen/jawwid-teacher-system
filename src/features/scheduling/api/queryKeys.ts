/**
 * Centralized React Query key factory for the Scheduling module.
 * Every hook reads keys from here so master-grid/per-teacher-view
 * caches (added in later phases) never drift apart from hand-typed keys.
 */
export const schedulingKeys = {
  all: ['scheduling'] as const,
  students: () => [...schedulingKeys.all, 'students'] as const,
  parents: () => [...schedulingKeys.all, 'parents'] as const,
  studentParents: () => [...schedulingKeys.all, 'studentParents'] as const,
  courses: () => [...schedulingKeys.all, 'courses'] as const,
  teacherAvailability: (teacherId?: string) => [...schedulingKeys.all, 'teacherAvailability', teacherId ?? 'all'] as const,
  shiftTemplates: () => [...schedulingKeys.all, 'shiftTemplates'] as const,
  teacherShiftAssignments: (teacherId?: string) => [...schedulingKeys.all, 'teacherShiftAssignments', teacherId ?? 'all'] as const,
  lessons: () => [...schedulingKeys.all, 'lessons'] as const,
  lessonParticipants: () => [...schedulingKeys.all, 'lessonParticipants'] as const,
  grid: (dayOfWeek: number) => [...schedulingKeys.all, 'grid', dayOfWeek] as const,
  /**
   * Lessons in a lifecycle status the grid does not show by default (today:
   * paused). Deliberately a SEPARATE key from `grid`: that one is the shared
   * "everything actually booked" entry the time picker and the conflict checks
   * read, so it must never vary with a UI filter.
   */
  gridExtraLifecycles: (dayOfWeek: number, statuses: readonly string[]) =>
    [...schedulingKeys.all, 'gridExtraLifecycles', dayOfWeek, [...statuses].sort().join(',')] as const,
  availabilityForDay: (dayOfWeek: number) => [...schedulingKeys.all, 'availabilityForDay', dayOfWeek] as const,
  exceptionsForDate: (occurrenceDate: string) => [...schedulingKeys.all, 'exceptionsForDate', occurrenceDate] as const,
  health: () => [...schedulingKeys.all, 'health'] as const,
  activeConflicts: () => [...schedulingKeys.all, 'activeConflicts'] as const,
  primaryTeacherInference: () => [...schedulingKeys.all, 'primaryTeacherInference'] as const,
  currentPrimaryTeachers: (studentIds: string[]) => [...schedulingKeys.all, 'currentPrimaryTeachers', studentIds] as const,
  preservationScore: (lessonId: string) => [...schedulingKeys.all, 'preservationScore', lessonId] as const,
};

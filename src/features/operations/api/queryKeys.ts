/**
 * Query-key factory for the Operations Module domain — a sibling to
 * schedulingKeys, not a merge into it, since Operations (session reports,
 * and later Follow-Ups/Payments/Notes) is a conceptually distinct set of
 * entities from core scheduling. Every future Operations entity adds its
 * own key function here, following this same shape — this factory, not a
 * shared data table, is the reusable piece across those future modules.
 */
export const operationsKeys = {
  all: ['operations'] as const,
  sessionReports: (lessonParticipantId: string) => [...operationsKeys.all, 'sessionReports', lessonParticipantId] as const,
  sessionReportsForLesson: (lessonParticipantIds: string[]) => [...operationsKeys.all, 'sessionReportsForLesson', lessonParticipantIds] as const,
};

import type { Student } from '@/lib/types';
import type { IntelligenceCandidate } from './types';

/** How recently-enrolled counts as "still time-sensitive" — a brand-new active
 * student with no lessons yet is the urgent case (the family is waiting to
 * start); beyond this window it's a stale backlog item, still real but not
 * as time-critical. */
const NEW_ENROLLMENT_DAYS = 3;

/**
 * Detector A+B, merged: this schema has no separate `current_teacher_id` field
 * on students — a student's "assigned teacher" and "regular schedule" are both
 * derived entirely from lesson_participants. So an unassigned active student
 * always has zero future lessons by construction; the original spec's
 * "upcoming lesson within 24h/7d" urgency tiers can never occur here (that
 * would require a profile-level teacher field decoupled from the schedule,
 * which doesn't exist in this data model). The one reliable, always-real
 * differentiator left is how long the student has gone without ever
 * getting a schedule (created_at) — used instead of fabricating a
 * schedule-based signal that isn't supported by the real data.
 */
export function detectUnassignedStudents(
  students: Student[],
  studentIdsWithLessons: Set<string>
): IntelligenceCandidate[] {
  const now = Date.now();
  return students
    .filter((s) => !s.isDeleted && s.status === 'active' && !studentIdsWithLessons.has(s.id))
    .map((s): IntelligenceCandidate => {
      const createdAtMs = s.createdAt ? new Date(s.createdAt).getTime() : NaN;
      const hasReliableDate = Number.isFinite(createdAtMs);
      const daysSinceEnrollment = hasReliableDate ? Math.max(0, Math.round((now - createdAtMs) / 86_400_000)) : null;
      const isRecent = daysSinceEnrollment !== null && daysSinceEnrollment <= NEW_ENROLLMENT_DAYS;

      return {
        id: `student-unassigned-${s.id}`,
        entityType: 'student',
        entityId: s.id,
        label: s.fullName,
        priority: isRecent ? 'high' : 'medium',
        confidence: hasReliableDate ? 'high' : 'medium',
        reasonCode: 'dashboard.intel.reason.studentNoTeacher',
        evidenceCode: hasReliableDate ? 'dashboard.intel.evidence.enrolledDaysAgo' : 'dashboard.intel.evidence.noScheduleData',
        evidenceParams: hasReliableDate ? { days: daysSinceEnrollment! } : undefined,
        actionCode: 'dashboard.intel.action.resolveIssue',
        actionTo: '/students?issue=unassigned-teacher',
      };
    });
}

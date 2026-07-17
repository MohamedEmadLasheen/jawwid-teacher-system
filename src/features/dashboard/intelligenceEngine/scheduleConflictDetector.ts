import { nextDateForDayOfWeek } from '@/features/scheduling/utils/nextDateForDayOfWeek';
import { minuteToLabel } from '@/features/scheduling/utils/timeGrid';
import type { ScheduleConflictRow, DayOfWeek } from '@/lib/types';
import type { CandidatePriority, IntelligenceCandidate } from './types';

/** Urgency tiers: this is a real current incident (an actual overlapping booking already
 * exists in the data), so — unlike hypothetical exposure — every conflict counts toward
 * the urgent bucket; only the priority tier differs based on how soon it bites. */
function priorityForOccurrence(dayOfWeek: DayOfWeek, startMinute: number): CandidatePriority {
  const dateStr = nextDateForDayOfWeek(dayOfWeek);
  const target = new Date(`${dateStr}T00:00:00`);
  target.setMinutes(target.getMinutes() + startMinute);
  const hoursUntil = (target.getTime() - Date.now()) / 3_600_000;
  if (hoursUntil <= 24) return 'critical';
  if (hoursUntil <= 24 * 7) return 'high';
  return 'medium';
}

/**
 * Detector C (Part 2 / Task A): maps raw get_active_schedule_conflicts() rows into
 * IntelligenceCandidates. Real overlap facts only — day/time come straight from the DB
 * function's set-based scan, never inferred or re-derived on the frontend.
 */
export function detectScheduleConflicts(
  rows: ScheduleConflictRow[],
  teacherNameById: Map<string, string>,
  studentNameById: Map<string, string>
): IntelligenceCandidate[] {
  return rows.map((r): IntelligenceCandidate => {
    const isTeacher = r.conflictType === 'teacher_double_booking';
    const entityId = (isTeacher ? r.teacherId : r.studentId) ?? '';
    const name = (isTeacher ? teacherNameById.get(entityId) : studentNameById.get(entityId)) ?? entityId;

    return {
      id: `conflict-${r.conflictType}-${r.lessonIdA}-${r.lessonIdB}`,
      entityType: isTeacher ? 'teacher' : 'student',
      entityId,
      label: name,
      dayOfWeek: r.dayOfWeek,
      priority: priorityForOccurrence(r.dayOfWeek, Math.min(r.startMinuteA, r.startMinuteB)),
      confidence: 'high',
      reasonCode: isTeacher ? 'dashboard.intel.reason.teacherDoubleBooking' : 'dashboard.intel.reason.studentDoubleBooking',
      reasonParams: { name },
      evidenceCode: 'dashboard.intel.evidence.overlappingLessons',
      evidenceParams: {
        timeA: minuteToLabel(r.startMinuteA),
        endA: minuteToLabel(r.startMinuteA + r.durationMinutesA),
        timeB: minuteToLabel(r.startMinuteB),
        endB: minuteToLabel(r.startMinuteB + r.durationMinutesB),
      },
      actionCode: 'dashboard.intel.action.reviewConflict',
      actionTo: isTeacher ? `/schedule/teacher?teacherId=${entityId}` : `/schedule?day=${r.dayOfWeek}`,
    };
  });
}

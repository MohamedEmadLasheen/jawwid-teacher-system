import { computeLessonPreservationScore } from '@/features/scheduling/utils/lessonPreservation';
import type { LessonWithParticipants } from '@/services/scheduling/lessons.service';

export type RiskLevel = 'high' | 'medium' | 'low';

export interface TomorrowRisk {
  id: string;
  labelKey: string;
  count: number;
  teacherName?: string;
  level: RiskLevel;
}

const LOW_PRESERVATION_THRESHOLD = 50;

/**
 * Pure — real signals about tomorrow's schedule, derived only from
 * already-fetched lessons (no availability/occupancy data needed, so this
 * works even though teacher_availability has zero rows in production).
 * Any signal with a zero count is simply omitted, never shown as a fake 0.
 */
export function computeTomorrowRisks(allLessons: LessonWithParticipants[], teacherNameById: Map<string, string>, tomorrowDayOfWeek: number): TomorrowRisk[] {
  const tomorrowLessons = allLessons.filter((l) => l.dayOfWeek === tomorrowDayOfWeek);
  const risks: TomorrowRisk[] = [];

  const countByTeacher = new Map<string, number>();
  tomorrowLessons.forEach((l) => countByTeacher.set(l.teacherId, (countByTeacher.get(l.teacherId) ?? 0) + 1));
  const busiest = [...countByTeacher.entries()].sort((a, b) => b[1] - a[1])[0];
  if (busiest && busiest[1] >= 3) {
    risks.push({
      id: 'busiestTeacherTomorrow',
      labelKey: 'dashboard.risk.busiestTeacher',
      count: busiest[1],
      teacherName: teacherNameById.get(busiest[0]) ?? busiest[0],
      level: busiest[1] >= 6 ? 'high' : 'medium',
    });
  }

  const lowPreservationCount = tomorrowLessons.filter((l) => computeLessonPreservationScore(l) < LOW_PRESERVATION_THRESHOLD).length;
  if (lowPreservationCount > 0) {
    risks.push({
      id: 'lowPreservation',
      labelKey: 'dashboard.risk.lowPreservation',
      count: lowPreservationCount,
      level: lowPreservationCount >= 3 ? 'high' : 'medium',
    });
  }

  const groupLessonCount = tomorrowLessons.filter((l) => l.participants.length > 1).length;
  if (groupLessonCount > 0) {
    risks.push({ id: 'groupLessons', labelKey: 'dashboard.risk.groupLessons', count: groupLessonCount, level: 'low' });
  }

  return risks;
}

import { OPERATIONS_SCORE_WEIGHTS } from './operationsScore';

export type MissionPriority = 'critical' | 'important' | 'recommended' | 'opportunity';

export interface MissionTask {
  id: string;
  priority: MissionPriority;
  titleKey: string;
  titleCount?: number;
  scoreGain: number;
  estimatedMinutes: number | null;
  ctaLabelKey: string;
  ctaTo: string;
  isRevenueOpportunity?: boolean;
  comingSoon?: boolean;
}

/** Minutes-per-unit estimates — the only non-reused numbers here (no existing time-tracking data exists to derive them from), kept in one place for later tuning. */
const MINUTES_PER_UNIT = {
  conflict: 4,
  primeSlot: 2.5,
  pausedContact: 3,
  overloadedTeacher: 5,
  underutilizedTeacher: 5,
} as const;

const PRIORITY_ORDER: Record<MissionPriority, number> = {
  critical: 0,
  important: 1,
  recommended: 2,
  opportunity: 3,
};

export interface TodaysMissionInputs {
  unresolvedConflicts: number;
  unusedPrimeTimeSlots: number;
  sellableEmptySlots: number;
  teachersAbove95Pct: number;
  teachersBelow40Pct: number;
  schedulablePausedStudents: number;
  unresolvedParentRequests: number;
}

/**
 * Pure — derives Today's Mission cards from the exact same inputs/weights
 * the Operations Score already uses (OPERATIONS_SCORE_WEIGHTS), so a
 * task's "score gain" is literally the points completing it would recover.
 * No new metric is invented; conflicts/parent requests render as
 * comingSoon since no real data source exists yet for them.
 */
export function generateTodaysMissions(inputs: TodaysMissionInputs): MissionTask[] {
  const tasks: MissionTask[] = [];

  tasks.push({
    id: 'conflicts',
    priority: 'critical',
    titleKey: 'dashboard.mission.task.conflicts',
    titleCount: inputs.unresolvedConflicts,
    scoreGain: inputs.unresolvedConflicts * Math.abs(OPERATIONS_SCORE_WEIGHTS.perUnresolvedConflict),
    estimatedMinutes: inputs.unresolvedConflicts * MINUTES_PER_UNIT.conflict,
    ctaLabelKey: 'dashboard.mission.cta.viewSchedule',
    ctaTo: '/schedule',
    comingSoon: true,
  });

  if (inputs.teachersAbove95Pct > 0) {
    tasks.push({
      id: 'overloaded-teachers',
      priority: 'important',
      titleKey: 'dashboard.mission.task.overloadedTeachers',
      titleCount: inputs.teachersAbove95Pct,
      scoreGain: inputs.teachersAbove95Pct * Math.abs(OPERATIONS_SCORE_WEIGHTS.perTeacherAbove95Pct),
      estimatedMinutes: inputs.teachersAbove95Pct * MINUTES_PER_UNIT.overloadedTeacher,
      ctaLabelKey: 'dashboard.mission.cta.assignTeacher',
      ctaTo: '/schedule/teacher',
    });
  }

  if (inputs.unusedPrimeTimeSlots > 0) {
    tasks.push({
      id: 'prime-time',
      priority: 'important',
      titleKey: 'dashboard.mission.task.primeTime',
      titleCount: inputs.unusedPrimeTimeSlots,
      scoreGain: inputs.unusedPrimeTimeSlots * Math.abs(OPERATIONS_SCORE_WEIGHTS.perUnusedPrimeTimeSlot),
      estimatedMinutes: inputs.unusedPrimeTimeSlots * MINUTES_PER_UNIT.primeSlot,
      ctaLabelKey: 'dashboard.mission.cta.viewSchedule',
      ctaTo: '/schedule',
      isRevenueOpportunity: true,
    });
  }

  if (inputs.schedulablePausedStudents > 0) {
    tasks.push({
      id: 'paused-students',
      priority: 'recommended',
      titleKey: 'dashboard.mission.task.pausedStudents',
      titleCount: inputs.schedulablePausedStudents,
      scoreGain: inputs.schedulablePausedStudents * Math.abs(OPERATIONS_SCORE_WEIGHTS.perSchedulablePausedStudent),
      estimatedMinutes: inputs.schedulablePausedStudents * MINUTES_PER_UNIT.pausedContact,
      ctaLabelKey: 'dashboard.mission.cta.openStudents',
      ctaTo: '/students',
    });
  }

  if (inputs.teachersBelow40Pct > 0) {
    tasks.push({
      id: 'underutilized-teachers',
      priority: 'recommended',
      titleKey: 'dashboard.mission.task.underutilizedTeachers',
      titleCount: inputs.teachersBelow40Pct,
      scoreGain: inputs.teachersBelow40Pct * Math.abs(OPERATIONS_SCORE_WEIGHTS.perTeacherBelow40Pct),
      estimatedMinutes: inputs.teachersBelow40Pct * MINUTES_PER_UNIT.underutilizedTeacher,
      ctaLabelKey: 'dashboard.mission.cta.review',
      ctaTo: '/schedule/teacher',
    });
  }

  if (inputs.sellableEmptySlots > 0) {
    tasks.push({
      id: 'empty-slots',
      priority: 'opportunity',
      titleKey: 'dashboard.mission.task.emptySlots',
      titleCount: inputs.sellableEmptySlots,
      scoreGain: inputs.sellableEmptySlots * Math.abs(OPERATIONS_SCORE_WEIGHTS.perSellableEmptySlot),
      estimatedMinutes: null,
      ctaLabelKey: 'dashboard.mission.cta.viewSchedule',
      ctaTo: '/schedule',
      isRevenueOpportunity: true,
    });
  }

  tasks.push({
    id: 'parent-requests',
    priority: 'opportunity',
    titleKey: 'dashboard.mission.task.parentRequests',
    titleCount: inputs.unresolvedParentRequests,
    scoreGain: inputs.unresolvedParentRequests * Math.abs(OPERATIONS_SCORE_WEIGHTS.perUnresolvedParentRequest),
    estimatedMinutes: null,
    ctaLabelKey: 'dashboard.mission.cta.review',
    ctaTo: '/schedule',
    comingSoon: true,
  });

  return tasks.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
}

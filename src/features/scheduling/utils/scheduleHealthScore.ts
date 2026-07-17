import type { AcademyHealthResult } from './academyHealth';

/** Single place to tune the Schedule Health Score weights. */
export const HEALTH_SCORE_WEIGHTS = {
  teacherOccupancy: 20,
  primeTimeUtilization: 20,
  teacherPreservation: 20,
  workloadBalance: 15,
  emptyHoursPenalty: 15,
  conflictPenalty: 10,
} as const;

export interface HealthScoreBreakdownItem { label: string; points: number }
export interface HealthScoreResult { score: number; rating: 'excellent' | 'good' | 'needs_attention' | 'critical'; breakdown: HealthScoreBreakdownItem[] }

function ratingFor(score: number): HealthScoreResult['rating'] {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 55) return 'needs_attention';
  return 'critical';
}

/** Pure — weighted combination of already-computed AcademyHealthResult figures.
 * Each factor scales 0..weight based on a real ratio (occupancy%, preservation%,
 * balanced-teacher share, empty-hours ratio); conflicts are a real subtraction
 * once a conflict queue exists (0 for now, honestly, not fabricated). */
export function computeScheduleHealthScore(health: AcademyHealthResult, unresolvedConflicts = 0): HealthScoreResult {
  const w = HEALTH_SCORE_WEIGHTS;
  const clamp = (v: number) => Math.max(0, Math.min(1, v));

  const occupancyFactor = clamp(1 - Math.abs(health.overview.teacherOccupancyRate - 75) / 75); // best near 75%
  const primeFactor = clamp(health.primeTime.occupancyPct / 100);
  const preservationFactor = clamp(health.preservation.avgPct / 100);
  const balancedShare = health.teacherRows.length > 0 ? health.distribution.balanced / health.teacherRows.length : 1;
  const emptyRatio = health.overview.weeklyCapacityHours > 0 ? health.overview.totalEmptyHours / health.overview.weeklyCapacityHours : 0;

  const breakdown: HealthScoreBreakdownItem[] = [
    { label: 'Teacher Occupancy', points: Math.round(occupancyFactor * w.teacherOccupancy) },
    { label: 'Prime Time Utilization', points: Math.round(primeFactor * w.primeTimeUtilization) },
    { label: 'Teacher Preservation', points: Math.round(preservationFactor * w.teacherPreservation) },
    { label: 'Workload Balance', points: Math.round(clamp(balancedShare) * w.workloadBalance) },
    { label: 'Empty Hours', points: Math.round(clamp(1 - emptyRatio) * w.emptyHoursPenalty) },
    { label: 'Conflict Penalty', points: -Math.min(unresolvedConflicts * 2, w.conflictPenalty) },
  ];

  const score = Math.max(0, Math.min(100, Math.round(breakdown.reduce((s, b) => s + b.points, 0))));
  return { score, rating: ratingFor(score), breakdown };
}

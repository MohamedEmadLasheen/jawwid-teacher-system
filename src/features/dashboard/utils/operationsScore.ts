/**
 * AI Operations Coach — scoring engine. Weights live in one place
 * (OPERATIONS_SCORE_WEIGHTS) so they can be tuned later without
 * touching the calculation logic.
 */
export const OPERATIONS_SCORE_WEIGHTS = {
  perUnresolvedConflict: -2,
  perUnusedPrimeTimeSlot: -1,
  perSellableEmptySlot: -1,
  perTeacherAbove95Pct: -3,
  perTeacherBelow40Pct: -2,
  perSchedulablePausedStudent: -2,
  perUnresolvedParentRequest: -1,
} as const;

export const OPERATIONS_SCORE_GOAL = 95;

export interface OperationsScoreInputs {
  unresolvedConflicts: number;
  unusedPrimeTimeSlots: number;
  sellableEmptySlots: number;
  teachersAbove95Pct: number;
  teachersBelow40Pct: number;
  schedulablePausedStudents: number;
  unresolvedParentRequests: number;
}

export type OperationsRating = 'excellent' | 'good' | 'needs_attention' | 'critical';

export interface OperationsScorePenalty {
  key: keyof OperationsScoreInputs;
  count: number;
  points: number;
}

export interface OperationsScoreResult {
  score: number;
  rating: OperationsRating;
  penalties: OperationsScorePenalty[];
}

export function getOperationsRating(score: number): OperationsRating {
  if (score >= 95) return 'excellent';
  if (score >= 85) return 'good';
  if (score >= 70) return 'needs_attention';
  return 'critical';
}

export type GreetingSummary =
  | { kind: 'healthy' }
  | { kind: 'scoreGap'; from: number; to: number }
  | { kind: 'opportunities'; count: number };

/** Pure — one-line summary under the greeting, derived only from the already-computed
 * score/goal/mission count (no new data, no invented numbers). */
export function computeGreetingSummary(score: number, actionableMissionCount: number): GreetingSummary {
  if (actionableMissionCount === 0) return { kind: 'healthy' };
  if (score < OPERATIONS_SCORE_GOAL) return { kind: 'scoreGap', from: score, to: OPERATIONS_SCORE_GOAL };
  return { kind: 'opportunities', count: actionableMissionCount };
}

/** Pure — how close today's score already is to the goal, as a 0-100 progress percentage. */
export function computeMissionProgressPct(score: number): number {
  return Math.round(Math.min(100, (score / OPERATIONS_SCORE_GOAL) * 100));
}

/** Pure, side-effect-free — 100 minus configured penalties, clamped 0-100. */
export function computeOperationsScore(inputs: OperationsScoreInputs): OperationsScoreResult {
  const factors: { key: keyof OperationsScoreInputs; count: number; weight: number }[] = [
    { key: 'unresolvedConflicts', count: inputs.unresolvedConflicts, weight: OPERATIONS_SCORE_WEIGHTS.perUnresolvedConflict },
    { key: 'unusedPrimeTimeSlots', count: inputs.unusedPrimeTimeSlots, weight: OPERATIONS_SCORE_WEIGHTS.perUnusedPrimeTimeSlot },
    { key: 'sellableEmptySlots', count: inputs.sellableEmptySlots, weight: OPERATIONS_SCORE_WEIGHTS.perSellableEmptySlot },
    { key: 'teachersAbove95Pct', count: inputs.teachersAbove95Pct, weight: OPERATIONS_SCORE_WEIGHTS.perTeacherAbove95Pct },
    { key: 'teachersBelow40Pct', count: inputs.teachersBelow40Pct, weight: OPERATIONS_SCORE_WEIGHTS.perTeacherBelow40Pct },
    { key: 'schedulablePausedStudents', count: inputs.schedulablePausedStudents, weight: OPERATIONS_SCORE_WEIGHTS.perSchedulablePausedStudent },
    { key: 'unresolvedParentRequests', count: inputs.unresolvedParentRequests, weight: OPERATIONS_SCORE_WEIGHTS.perUnresolvedParentRequest },
  ];

  const penalties: OperationsScorePenalty[] = factors
    .map((f) => ({ key: f.key, count: f.count, points: f.count * f.weight }))
    .filter((p) => p.count > 0);

  const totalPenalty = penalties.reduce((sum, p) => sum + p.points, 0);
  const score = Math.min(100, Math.max(0, 100 + totalPenalty));

  return { score, rating: getOperationsRating(score), penalties };
}

import { SCORING_RULES, computeOperationsScoreGain } from './scoringRules';
import { RECOMMENDATION_PRIORITY_WEIGHTS } from './config';
import type { MoveCandidate, ScoredCandidate } from './types';

/** Pure — runs every pluggable rule over one candidate and sums priority-weighted points. */
export function scoreCandidate(candidate: MoveCandidate): ScoredCandidate {
  const factors = SCORING_RULES.map((rule) => {
    const weight = RECOMMENDATION_PRIORITY_WEIGHTS[rule.priority] ?? 1;
    const result = rule.evaluate(candidate);
    return { id: rule.id, priority: rule.priority, ...result, points: result.points * weight };
  });

  const totalScore = factors.reduce((sum, f) => sum + f.points, 0);
  const maxPossibleScore = SCORING_RULES.reduce((sum, r) => sum + (RECOMMENDATION_PRIORITY_WEIGHTS[r.priority] ?? 1), 0);
  const positiveScore = factors.reduce((sum, f) => sum + Math.max(f.points, 0), 0);
  const confidencePct = maxPossibleScore > 0 ? Math.round((positiveScore / maxPossibleScore) * 100) : 0;

  return { candidate, totalScore, maxPossibleScore, confidencePct, factors, operationsScoreGain: computeOperationsScoreGain(candidate) };
}

/** Ranks every candidate by business impact (total score) and returns the top `limit` — lets the UI
 * present alternatives (Option A/B/C) instead of only ever a single recommendation. */
export function selectTopCandidates(scored: ScoredCandidate[], limit: number): ScoredCandidate[] {
  return [...scored].sort((a, b) => b.totalScore - a.totalScore).slice(0, limit);
}

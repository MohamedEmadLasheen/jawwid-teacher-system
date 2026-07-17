import { generateMoveCandidates } from './candidateGenerator';
import { scoreCandidate } from './scorer';
import type { ScoredCandidate } from './types';

export type { MoveCandidate, ScoredCandidate, ScoredFactor, ScoringRule } from './types';
export { SCORING_RULES } from './scoringRules';

export interface RecommendationQueueItem {
  /** Best-scored option for this teacher's one lesson-move opportunity. */
  candidate: ScoredCandidate;
  /** Other scored time-slot options for the SAME lesson (Option B/C…). */
  alternatives: ScoredCandidate[];
}

/** Orchestrates generate → score → group → rank: candidateGenerator.ts produces at most one
 * lesson-move opportunity per overloaded teacher (each with up to 3 time-slot alternatives).
 * This groups those alternatives back under their own recommendation and ranks the resulting
 * queue by business impact — real AI Action Queue over the existing deterministic scoring,
 * not a single frozen recommendation. */
export async function getRecommendationQueue(
  overloadedTeachers: { teacherId: string; fullName: string; weeklyLessons: number }[]
): Promise<RecommendationQueueItem[]> {
  const candidates = await generateMoveCandidates(overloadedTeachers);
  const scored = candidates.map(scoreCandidate);

  const groups = new Map<string, ScoredCandidate[]>();
  scored.forEach((sc) => {
    const key = sc.candidate.teacherId;
    const arr = groups.get(key) ?? [];
    arr.push(sc);
    groups.set(key, arr);
  });

  const items: RecommendationQueueItem[] = [...groups.values()].map((group) => {
    const sorted = [...group].sort((a, b) => b.totalScore - a.totalScore);
    return { candidate: sorted[0], alternatives: sorted.slice(1) };
  });

  return items.sort((a, b) => b.candidate.totalScore - a.candidate.totalScore);
}

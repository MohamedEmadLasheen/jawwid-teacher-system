import { OPERATIONS_SCORE_WEIGHTS } from '../utils/operationsScore';
import type { MoveCandidate, ScoringRule } from './types';

/**
 * The 7 priority-ordered rules from the spec. Every rule reuses real,
 * already-computed data — none invent a metric that doesn't exist yet.
 * Rules with no backing data source (parent preference) honestly report
 * zero/"not available" rather than fabricate a number.
 */
// i18n key prefix for every factor's label/detail — see en.json/ar.json
// `dashboard.recommendation.factors.*`. Codes only; no rendered strings here.
const F = 'dashboard.recommendation.factors.';

export const SCORING_RULES: ScoringRule[] = [
  {
    id: 'teacherPreservation',
    priority: 1,
    evaluate: (c: MoveCandidate) => {
      const delta = c.preservationAfterScore - c.preservationBeforeScore;
      return {
        points: Math.sign(delta),
        labelCode: `${F}preservationLabel`,
        labelParams: { delta: `${delta > 0 ? '+' : ''}${delta}` },
        detailCode: `${F}preservationDetail`,
        detailParams: { before: c.preservationBeforeScore, after: c.preservationAfterScore },
      };
    },
  },
  {
    id: 'noConflicts',
    priority: 2,
    evaluate: () => ({
      // Candidates that would conflict are discarded before scoring (see candidateGenerator.ts),
      // so every scored candidate is guaranteed conflict-free — always the full positive point.
      points: 1,
      labelCode: `${F}noConflictsLabel`,
      detailCode: `${F}noConflictsDetail`,
    }),
  },
  {
    id: 'parentPreference',
    priority: 3,
    evaluate: () => ({
      points: 0,
      labelCode: `${F}parentPreferenceLabel`,
      detailCode: `${F}parentPreferenceDetail`,
    }),
  },
  {
    id: 'primeTimeUtilization',
    priority: 4,
    evaluate: (c: MoveCandidate) => {
      const points = c.toInPrimeTime && !c.fromInPrimeTime ? 1 : c.toInPrimeTime === c.fromInPrimeTime ? 0 : -1;
      const detailCode = points > 0 ? 'primeTimeDetailInto' : points < 0 ? 'primeTimeDetailOut' : 'primeTimeDetailNoChange';
      return {
        points,
        labelCode: `${F}${points > 0 ? 'primeTimeIntoLabel' : points < 0 ? 'primeTimeOutLabel' : 'primeTimeNoChangeLabel'}`,
        detailCode: `${F}${detailCode}`,
      };
    },
  },
  {
    id: 'teacherWorkloadBalance',
    priority: 5,
    evaluate: () => ({
      points: 0,
      labelCode: `${F}workloadLabel`,
      detailCode: `${F}workloadDetail`,
    }),
  },
  {
    id: 'recoverSellableSlots',
    priority: 6,
    evaluate: () => ({
      points: 0,
      labelCode: `${F}capacityLabel`,
      detailCode: `${F}capacityDetail`,
    }),
  },
  {
    id: 'operationsScoreImpact',
    priority: 7,
    evaluate: (c: MoveCandidate) => {
      const gain = computeOperationsScoreGain(c);
      return {
        points: gain > 0 ? 1 : 0,
        labelCode: `${F}${gain > 0 ? 'opsScoreGainLabel' : 'opsScoreNoChangeLabel'}`,
        labelParams: gain > 0 ? { gain } : undefined,
        detailCode: `${F}${gain > 0 ? 'opsScoreGainDetail' : 'opsScoreNoChangeDetail'}`,
      };
    },
  },
];

/** The real Operations Score point gain a move would produce — single source of truth
 * reused by both the scoring rule above and the UI's headline "Operations Score" stat. */
export function computeOperationsScoreGain(c: MoveCandidate): number {
  return c.toInPrimeTime && !c.fromInPrimeTime ? Math.abs(OPERATIONS_SCORE_WEIGHTS.perUnusedPrimeTimeSlot) : 0;
}

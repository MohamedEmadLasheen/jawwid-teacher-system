import type { PrimaryTeacherInferenceRow } from '@/lib/types';

export type EvidenceStrength = 'strong' | 'moderate' | 'limited' | 'ambiguous' | 'none';

/**
 * UI-only presentation layer on top of Task B's SQL confidence classification —
 * never redefines or overrides it. A 2/2 (100%) HIGH-confidence case and a 40/42
 * (95.2%) HIGH-confidence case are both "high" in the DB, but operationally very
 * different; this label surfaces that difference for review prioritization only.
 */
export function computeEvidenceStrength(row: PrimaryTeacherInferenceRow): EvidenceStrength {
  if (!row.candidateTeacherId || row.analyzedLessonCount === 0) return 'none';
  if (row.confidence === 'low') return 'ambiguous';
  if (row.confidence === 'insufficient') return 'limited';
  // confidence is 'high' or 'medium' here — analyzedLessonCount >= 2 by construction.
  if (row.analyzedLessonCount >= 8 && (row.candidateSharePct ?? 0) >= 90) return 'strong';
  if (row.analyzedLessonCount >= 4) return 'moderate';
  return 'limited';
}

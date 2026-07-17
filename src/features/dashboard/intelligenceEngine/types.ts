export type CandidatePriority = 'critical' | 'high' | 'medium' | 'low';
export type CandidateConfidence = 'high' | 'medium' | 'low';

/**
 * Common shape for every deterministic operational candidate the Intelligence
 * Candidate Engine produces. No user-facing text is ever stored here — only
 * i18n reason/evidence/action codes + params, resolved via t() at render
 * time (label is real data — a name — not a translated sentence).
 */
export interface IntelligenceCandidate {
  id: string;
  entityType: 'student' | 'teacher';
  entityId: string;
  label: string;
  /** Raw day-of-week (0=Sunday), when the candidate is tied to a specific schedule
   * slot — kept separate from evidenceParams so the render site can resolve the
   * translated day name via the existing DAYS_OF_WEEK labelKey pattern, matching
   * how day names are already rendered elsewhere (never interpolated as raw text). */
  dayOfWeek?: number;
  priority: CandidatePriority;
  confidence: CandidateConfidence;
  reasonCode: string;
  reasonParams?: Record<string, string | number>;
  evidenceCode: string;
  evidenceParams?: Record<string, string | number>;
  actionCode: string;
  actionTo: string;
}

/**
 * THE NINE TEACHER-EVALUATION CRITERIA, and everything pure that acts on them.
 *
 * One module owns the criterion list, the scoring arithmetic, the JSONB
 * round-trip and the save-time validation, so the form, the service and the
 * tests can never disagree about any of them. It imports nothing but types —
 * no React, no Supabase, no i18n — which is what lets the node test runner
 * bundle it with esbuild and assert on it directly (see
 * scripts/evaluation-tests/), exactly as searchText.ts is tested.
 *
 * It sits in src/lib, beside searchText.ts and riskEngine.ts, because it is a
 * pure domain module rather than a piece of one screen: the service layer and
 * src/lib/types.ts both depend on it, and neither may depend on a feature.
 *
 * WHAT IS NOT DECIDED HERE: the visible label of a criterion. Keys are stable
 * English identifiers used as database keys and i18n lookup keys; the words a
 * supervisor reads come from `evaluation.criterion.<key>` in src/i18n, under
 * the application's existing localisation architecture.
 */

import type { QuickRating, EvaluationGrade } from './types';

/**
 * The nine criteria, as ordered identifiers.
 *
 * The ORDER is the order they are presented in and is part of the contract —
 * a supervisor comparing two evaluations reads the same criterion in the same
 * position. The KEYS are what land in `session_evaluations.criteria`, so
 * renaming one is a data migration, not a refactor.
 *
 * Two keys (`studentEngagement`, `punctuality`) are spelled the same as legacy
 * columns on the same table. That is harmless and deliberate: these live
 * nested inside `criteria`, never as top-level columns, and the legacy columns
 * are not read for a 9-criteria evaluation (see migration 024). Their visible
 * labels differ, which is why the i18n keys are namespaced under
 * `evaluation.criterion.` rather than reusing the flat legacy label keys.
 */
export const EVALUATION_CRITERION_KEYS = [
  'cameraAppearanceLighting',
  'studentEngagement',
  'mistakeCorrectionQuality',
  'interactiveEngagement',
  'recitationTajweed',
  'fushaCommitment',
  'punctuality',
  'halaqahManagement',
  'explanationClarity',
] as const;

export type EvaluationCriterionKey = (typeof EVALUATION_CRITERION_KEYS)[number];

/**
 * One criterion's assessment: a required score on the existing 4-level scale,
 * and a comment that belongs to THIS criterion and no other.
 *
 * The comment is nested inside the criterion rather than sitting beside it in
 * a parallel structure precisely so that "criterion 2's comment" cannot be
 * written into criterion 3 — there is no path to one criterion's comment
 * except through that criterion.
 */
export interface EvaluationCriterion {
  score: QuickRating;
  /** Optional by product contract. Empty string when not given, never null. */
  comment: string;
}

/** All nine, complete. The form always holds a full set. */
export type EvaluationCriteria = Record<EvaluationCriterionKey, EvaluationCriterion>;

/**
 * The rating a criterion starts at, unchanged from the pre-existing form.
 * Scores are required, so every criterion begins at a real value rather than
 * an empty one.
 */
export const DEFAULT_RATING: QuickRating = 'good';

/** The existing 4-level scale. NOT a new scale — this is what the form has always used. */
export const RATING_OPTIONS: readonly QuickRating[] = [
  'excellent',
  'good',
  'acceptable',
  'needs_improvement',
];

/** The existing ordinal values behind that scale. */
export const RATING_SCORE: Record<QuickRating, number> = {
  excellent: 4,
  good: 3,
  acceptable: 2,
  needs_improvement: 1,
};

export type BehavioralObservation =
  | 'excellent'
  | 'good'
  | 'needs_improvement'
  | 'critical_issue';

/** The existing behavioural bonus/penalty, applied to the normalised score. */
const BEHAVIORAL_BONUS: Record<BehavioralObservation, number> = {
  excellent: 5,
  good: 2,
  needs_improvement: -5,
  critical_issue: -10,
};

export function emptyCriteria(): EvaluationCriteria {
  return EVALUATION_CRITERION_KEYS.reduce((acc, key) => {
    acc[key] = { score: DEFAULT_RATING, comment: '' };
    return acc;
  }, {} as EvaluationCriteria);
}

function isQuickRating(value: unknown): value is QuickRating {
  return typeof value === 'string' && (RATING_OPTIONS as readonly string[]).includes(value);
}

/**
 * Set one criterion's score or comment, returning a NEW set.
 *
 * Exists as a function rather than an inline spread at the call site so that
 * "updating one criterion leaves the other eight exactly as they were" is a
 * property of one testable place instead of a property of however many
 * handlers the form happens to have.
 */
export function setCriterion(
  criteria: EvaluationCriteria,
  key: EvaluationCriterionKey,
  patch: Partial<EvaluationCriterion>
): EvaluationCriteria {
  return { ...criteria, [key]: { ...criteria[key], ...patch } };
}

/**
 * Serialise for `session_evaluations.criteria`.
 *
 * Comments are trimmed — a textarea holding only whitespace is not a comment —
 * but the `comment` key is always written, so the stored shape is identical
 * for a commented and an uncommented criterion and the round trip is exact.
 *
 * VALIDATES FIRST, and throws rather than writing anything questionable. This
 * is the last point at which the shape is still in our hands, and all three
 * failures it catches are silent ones:
 *
 *   * an incomplete or malformed set used to throw a bare
 *     "Cannot read properties of undefined (reading 'score')" from inside the
 *     loop — a stack trace rather than a statement of what was wrong;
 *   * an invalid score (a value outside the 4-level scale) used to be
 *     persisted verbatim. Nothing in the database rejects it — the CHECK
 *     constraint only asserts the column is an object — and `parseCriteria`
 *     substitutes the default on the way back, so the stored score and the
 *     displayed score would disagree forever, with no error anywhere.
 *
 * Throwing keeps a half-formed evaluation out of a live table. The create
 * path validates before reaching here, so this is the backstop, not the
 * mechanism the UI relies on.
 */
export function serializeCriteria(
  criteria: EvaluationCriteria
): Record<string, { score: QuickRating; comment: string }> {
  const errors = validateCriteria(criteria);
  if (errors.length > 0) {
    throw new Error(
      `Refusing to persist an invalid evaluation criteria set: ${errors.join(', ')}`
    );
  }

  const out: Record<string, { score: QuickRating; comment: string }> = {};
  for (const key of EVALUATION_CRITERION_KEYS) {
    out[key] = { score: criteria[key].score, comment: criteria[key].comment.trim() };
  }
  return out;
}

/**
 * Read `session_evaluations.criteria` back.
 *
 * Returns `null` for a HISTORICAL evaluation — one stored before this feature
 * existed, whose column is the `'{}'` default. `null` rather than a set of
 * nine defaults is deliberate: a display that showed nine invented "Good"
 * ratings for an evaluation nobody scored that way would be fabricating data
 * about a real teacher. Callers must handle `null` by showing nothing.
 *
 * Tolerant in both directions, because a row may have been written by an older
 * or a newer build than the one reading it:
 *   * an unknown key is ignored,
 *   * a missing key falls back to the default rating,
 *   * a missing, non-string or unrecognised score falls back to the default
 *     rating rather than throwing,
 *   * a missing or non-string comment becomes ''.
 * Anything that is not a JSON object at all is treated as historical.
 */
export function parseCriteria(raw: unknown): EvaluationCriteria | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;

  const source = raw as Record<string, unknown>;
  if (Object.keys(source).length === 0) return null;

  /**
   * Not merely "is it non-empty" but "does it hold anything we recognise".
   *
   * An object carrying ONLY unknown keys — a row written by a build whose
   * criterion keys were all renamed, or a column repurposed by hand — used to
   * fall through to the reduce below and come back as nine fabricated `good`
   * ratings attributed to a real teacher. Reading it as historical is the
   * honest answer: we have no 9-criteria data here, and saying so is what
   * every caller already knows how to handle.
   */
  if (!EVALUATION_CRITERION_KEYS.some((key) => key in source)) return null;

  return EVALUATION_CRITERION_KEYS.reduce((acc, key) => {
    const entry = source[key];
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      acc[key] = { score: DEFAULT_RATING, comment: '' };
      return acc;
    }
    const { score, comment } = entry as { score?: unknown; comment?: unknown };
    acc[key] = {
      score: isQuickRating(score) ? score : DEFAULT_RATING,
      comment: typeof comment === 'string' ? comment : '',
    };
    return acc;
  }, {} as EvaluationCriteria);
}

/**
 * The overall score, on the EXISTING 0-100 scale with the EXISTING formula.
 *
 * Unchanged from the form this replaces except for the number of criteria it
 * averages (nine instead of sixteen): the ordinal sum is normalised against
 * its own maximum, scaled to 90, the behavioural bonus is added, and the
 * result is clamped to 0-100. Because the normalisation is against the number
 * of criteria actually scored, a 9-criteria score and a historical 16-criteria
 * score are on the same scale and remain directly comparable — which is what
 * lets every existing average, badge and risk calculation keep working across
 * the two eras untouched.
 */
export function computeEvaluationScore(
  criteria: EvaluationCriteria,
  behavioral: BehavioralObservation
): number {
  const scores = EVALUATION_CRITERION_KEYS.map((key) => RATING_SCORE[criteria[key].score]);
  const sum = scores.reduce((total, value) => total + value, 0);
  const max = scores.length * RATING_SCORE.excellent;
  const normalised = Math.round((sum / max) * 90);
  return Math.min(100, Math.max(0, normalised + BEHAVIORAL_BONUS[behavioral]));
}

/** The existing grade thresholds, unchanged. */
export function gradeForScore(score: number): EvaluationGrade {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 60) return 'average';
  if (score >= 45) return 'weak';
  return 'critical';
}

/**
 * The three quick templates, remapped onto the nine criteria. Same intent as
 * the templates they replace: a strong session, one needing follow-up, and an
 * attendance problem. A template only ever sets SCORES — it never writes a
 * comment, because an invented comment would read as an observation somebody
 * actually made.
 */
export const EVALUATION_TEMPLATES: Record<string, Partial<Record<EvaluationCriterionKey, QuickRating>>> = {
  template_excellent: {
    cameraAppearanceLighting: 'excellent',
    studentEngagement: 'excellent',
    mistakeCorrectionQuality: 'excellent',
    interactiveEngagement: 'excellent',
    recitationTajweed: 'excellent',
    fushaCommitment: 'excellent',
    punctuality: 'excellent',
    halaqahManagement: 'excellent',
    explanationClarity: 'excellent',
  },
  template_followup: {
    cameraAppearanceLighting: 'good',
    studentEngagement: 'acceptable',
    mistakeCorrectionQuality: 'needs_improvement',
    interactiveEngagement: 'acceptable',
    recitationTajweed: 'good',
    fushaCommitment: 'acceptable',
    punctuality: 'good',
    halaqahManagement: 'acceptable',
    explanationClarity: 'acceptable',
  },
  template_attendance: {
    cameraAppearanceLighting: 'acceptable',
    studentEngagement: 'good',
    mistakeCorrectionQuality: 'good',
    interactiveEngagement: 'good',
    recitationTajweed: 'good',
    fushaCommitment: 'good',
    punctuality: 'needs_improvement',
    halaqahManagement: 'acceptable',
    explanationClarity: 'good',
  },
};

export function applyTemplate(
  criteria: EvaluationCriteria,
  templateKey: string
): EvaluationCriteria {
  const template = EVALUATION_TEMPLATES[templateKey];
  if (!template) return criteria;

  return EVALUATION_CRITERION_KEYS.reduce((acc, key) => {
    const score = template[key];
    // Comments are carried over untouched: a template changes scores, and a
    // supervisor who has already written an observation does not lose it.
    acc[key] = score ? { ...criteria[key], score } : criteria[key];
    return acc;
  }, {} as EvaluationCriteria);
}

export type EvaluationValidationError =
  | 'teacher_required'
  | 'criteria_missing'
  | 'criteria_incomplete'
  | 'criteria_unknown_key'
  | 'criteria_malformed'
  | 'criteria_invalid_score';

/**
 * Is this a complete, well-formed set of all nine criteria?
 *
 * Separate from the UI, because the UI is not the only thing that can produce
 * one: the form builds its set from `emptyCriteria` and only ever mutates it
 * through `setCriterion`, so it cannot go wrong — but the service accepts
 * whatever it is handed, and that is the boundary where a half-formed
 * evaluation would reach a live table.
 *
 * Each error names a distinct way the set can be wrong, so a caller (and a
 * test) can tell them apart:
 *
 *   criteria_missing        null/undefined, or not an object at all
 *   criteria_incomplete     a required criterion is absent
 *   criteria_unknown_key    a key that is not one of the nine
 *   criteria_malformed      a criterion is not an object, or its comment is
 *                           not a string
 *   criteria_invalid_score  a score outside the existing 4-level scale
 *
 * Deliberately NOT lenient the way `parseCriteria` is. Reading tolerates what
 * is already stored, because the alternative is a crash on a row nobody can
 * fix; WRITING refuses it, because the alternative is making that row.
 */
export function validateCriteria(raw: unknown): EvaluationValidationError[] {
  if (raw === null || raw === undefined) return ['criteria_missing'];
  if (typeof raw !== 'object' || Array.isArray(raw)) return ['criteria_missing'];

  const source = raw as Record<string, unknown>;
  const errors = new Set<EvaluationValidationError>();

  for (const key of Object.keys(source)) {
    if (!(EVALUATION_CRITERION_KEYS as readonly string[]).includes(key)) {
      errors.add('criteria_unknown_key');
    }
  }

  for (const key of EVALUATION_CRITERION_KEYS) {
    const entry = source[key];
    if (entry === undefined) {
      errors.add('criteria_incomplete');
      continue;
    }
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.add('criteria_malformed');
      continue;
    }
    const { score, comment } = entry as { score?: unknown; comment?: unknown };
    if (!isQuickRating(score)) errors.add('criteria_invalid_score');
    // A comment is OPTIONAL, so absent is fine; present-but-not-text is not.
    if (comment !== undefined && typeof comment !== 'string') errors.add('criteria_malformed');
  }

  return [...errors];
}

/**
 * What must be true before an evaluation may be saved.
 *
 * A teacher is REQUIRED — an evaluation that names no teacher is about nobody.
 * All nine criteria must be present with a score drawn from the existing
 * 4-level scale; the UI satisfies that by construction, and this states it so
 * that nothing else can quietly not satisfy it. Comments, both per-criterion
 * and general, are OPTIONAL — the pre-existing product contract for the one
 * comment field that already existed, extended unchanged to the new ones.
 */
export function validateEvaluationDraft(draft: {
  teacherId: string;
  criteria?: unknown;
}): EvaluationValidationError[] {
  const errors: EvaluationValidationError[] = [];
  if (!draft.teacherId.trim()) errors.push('teacher_required');
  // Only checked when supplied, so a caller asking purely "is the teacher set
  // yet?" while the form is still being filled in is not told the criteria are
  // missing as well.
  if ('criteria' in draft) errors.push(...validateCriteria(draft.criteria));
  return errors;
}

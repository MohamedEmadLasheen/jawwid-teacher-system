/**
 * Student form validation — pure, so every rule is provable without React,
 * a browser or a database (see
 * scripts/schedule-geometry-tests/studentadmin.test.mjs).
 *
 * WHY THE RESPONSIBLE ADMIN IS REQUIRED HERE AND NOT IN THE DATABASE
 *
 * `students.supervisor_id` is deliberately still nullable (migration 023
 * explains why at length): this is a live system, legacy rows may predate the
 * ownership rule, and a NOT NULL would have to be paid for either by failing
 * the migration or by inventing an assignment — and inventing one is worse
 * than admitting the gap. So NULL keeps exactly one meaning, "legacy, not yet
 * assigned", and is never produced by this application again: the create and
 * edit forms both run this function and refuse to submit without an Admin.
 *
 * Editing a legacy student therefore requires choosing one. That is the
 * point — the edit form is the path by which the backlog is cleared, and the
 * Students page's "Unassigned" filter is the worklist.
 */

export interface StudentDraft {
  fullName: string;
  /** The responsible Admin — `supervisors.id`. */
  supervisorId?: string | null;
}

/** One error code per field; the UI maps it to a translated message. */
export type StudentValidationErrors = Partial<Record<'fullName' | 'supervisorId', 'required'>>;

export function validateStudentDraft(draft: StudentDraft): StudentValidationErrors {
  const errors: StudentValidationErrors = {};
  if (!draft.fullName.trim()) errors.fullName = 'required';
  // Trimmed because an all-whitespace id is not a selection, and '' is what
  // an untouched SearchableSelect reports.
  if (!(draft.supervisorId ?? '').trim()) errors.supervisorId = 'required';
  return errors;
}

export function isStudentDraftValid(draft: StudentDraft): boolean {
  return Object.keys(validateStudentDraft(draft)).length === 0;
}

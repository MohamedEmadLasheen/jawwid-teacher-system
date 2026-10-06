import type { Student } from '@/lib/types';

/**
 * Responsible-Admin assignment, as the Schedule's create and edit flows need
 * it. Pure, so every rule is provable without React, a dialog or a database
 * (see scripts/schedule-geometry-tests/scheduleadmin.test.mjs).
 *
 * THE INVARIANT THIS FILE EXISTS TO PROTECT
 *
 * Ownership lives on the STUDENT — `students.supervisor_id` — and nowhere
 * else. A lesson has no admin of its own, which is why these functions only
 * ever produce writes addressed to a student id. A student's Responsible
 * Admin is therefore the same in every lesson they appear in by
 * construction: there is only one place it can be read from, and one place
 * it can be written to.
 *
 * The Schedule dialogs hold a DRAFT — the choices made in the open dialog,
 * keyed by student id — layered over what the database already stores. The
 * draft is not a second source of truth: it is unsaved input, it only ever
 * covers the students on screen, and `pendingAdminWrites` reduces it back to
 * the student rows that actually need updating.
 */

/** One row of the "Student → Responsible Admin" panel. */
export interface StudentAdminRow {
  studentId: string;
  fullName: string;
  /** What `students.supervisor_id` holds right now. */
  storedSupervisorId: string | null;
  /** What the dialog shows: the draft choice if one was made, else the stored value. */
  effectiveSupervisorId: string | null;
  /** No admin stored and none chosen — the user must pick one. */
  isMissing: boolean;
  /** The draft differs from what is stored, so saving must write this student. */
  isChanged: boolean;
}

/**
 * The panel's rows, in the order the students were selected.
 *
 * An id with no matching student record is dropped rather than rendered as a
 * blank row: it can only mean the student list has not finished loading or the
 * record was deleted, and inventing a row would invite assigning an admin to
 * something that does not exist.
 */
export function resolveStudentAdminRows(
  studentIds: string[],
  students: Student[],
  drafts: Record<string, string> = {}
): StudentAdminRow[] {
  const byId = new Map(students.map((s) => [s.id, s]));
  const rows: StudentAdminRow[] = [];

  for (const studentId of studentIds) {
    const student = byId.get(studentId);
    if (!student) continue;

    const stored = student.supervisorId ?? null;
    const drafted = drafts[studentId];
    // An empty draft is "not chosen yet", not "clear the assignment": this
    // panel can assign and reassign, never un-assign. Nothing here can turn an
    // owned student back into an unowned one.
    const effective = drafted && drafted.trim() ? drafted : stored;

    rows.push({
      studentId,
      fullName: student.fullName,
      storedSupervisorId: stored,
      effectiveSupervisorId: effective,
      isMissing: !effective,
      isChanged: !!effective && effective !== stored,
    });
  }

  return rows;
}

/** The students still needing a choice, as a plain fact about the rows. */
export function missingAdminStudentIds(rows: StudentAdminRow[]): string[] {
  return rows.filter((row) => row.isMissing).map((row) => row.studentId);
}

/**
 * The students whose missing Admin should actually BLOCK creating a lesson.
 *
 * Identical to `missingAdminStudentIds`, except that it requires nothing when
 * there is no Admin to choose. A requirement that cannot be satisfied is not a
 * requirement, it is a deadlock: an academy with no Operations Supervisors
 * configured — a fresh install, or a seed that has not run yet — would be
 * unable to schedule anything at all, with no remedy anywhere in the dialog.
 * Scheduling must not become impossible because an unrelated table is empty.
 *
 * Every real configuration has the four Admins, so this changes nothing there;
 * it only keeps the failure mode sane in the one case where the rule has
 * nothing to stand on.
 */
export function blockingAdminStudentIds(
  rows: StudentAdminRow[],
  availableAdminCount: number
): string[] {
  if (availableAdminCount === 0) return [];
  return missingAdminStudentIds(rows);
}

/**
 * The student updates to apply, and nothing more.
 *
 * Only genuinely changed rows appear, so creating a lesson for students who
 * already have an admin writes nothing at all — an existing assignment is
 * preserved unless the user explicitly changed it. Each entry is a
 * single-column update to one student row.
 */
export function pendingAdminWrites(
  rows: StudentAdminRow[]
): { studentId: string; supervisorId: string }[] {
  return rows
    .filter((row) => row.isChanged && row.effectiveSupervisorId)
    .map((row) => ({ studentId: row.studentId, supervisorId: row.effectiveSupervisorId! }));
}

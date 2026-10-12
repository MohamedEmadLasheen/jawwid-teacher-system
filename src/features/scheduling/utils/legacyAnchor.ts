import type { Teacher } from '@/lib/types';

/**
 * LEGACY SCHEDULE ANCHOR — a previous teacher identity kept only because
 * preserved schedule rows still reference it.
 *
 * Why this distinction exists. `teacher_shift_assignments.teacher_id` and
 * `teacher_availability.teacher_id` both reference `teachers(id)` with
 * ON DELETE CASCADE, so clearing the old teacher population would delete the
 * schedule with it. The rebuild therefore retains the referenced rows instead
 * of deleting them, marked with the two indicators the schema already has.
 *
 * The markers, and why BOTH are required:
 *
 *   is_deleted = true   keeps the row out of every teacher picker and out of
 *                       the roster page, which all test isDeleted.
 *   status = 'inactive' is what separates a deliberate anchor from an ordinary
 *                       soft delete. deleteTeacher() in teachers.service.ts
 *                       sets only is_deleted and deleted_at and leaves status
 *                       alone, so a normally deleted teacher keeps
 *                       status = 'active' and is NOT an anchor: their
 *                       assignments stay hidden, exactly as before.
 *
 * No column was added for this. Adding one would be a schema change, and the
 * two existing markers already carry the distinction.
 *
 * An anchor is visible in the schedule and nowhere else. It renders its own
 * preserved assignments so the grid still shows the shift that exists, and it
 * is excluded from the active roster, from new lesson assignment, from
 * teacher pickers and from Smart Assistant candidates — all of which filter on
 * isDeleted and therefore exclude it already.
 */
export function isLegacyScheduleAnchor(
  teacher: Pick<Teacher, 'isDeleted' | 'status'>
): boolean {
  return teacher.isDeleted === true && teacher.status === 'inactive';
}

/**
 * An ACTIVE teacher: eligible for the roster, new lessons and every normal
 * teacher operation. Deliberately stricter than `!isDeleted` so a teacher
 * parked as inactive is not offered new work either.
 */
export function isActiveTeacher(
  teacher: Pick<Teacher, 'isDeleted' | 'status'>
): boolean {
  return teacher.isDeleted !== true && teacher.status === 'active';
}

/**
 * A teacher the schedule may RESOLVE AND DISPLAY: either currently active, or
 * a legacy anchor whose preserved rows must still render.
 *
 * This is the display rule, never the selection rule. Selection uses
 * isActiveTeacher, or the existing isDeleted filters.
 */
export function isScheduleDisplayable(
  teacher: Pick<Teacher, 'isDeleted' | 'status'>
): boolean {
  return teacher.isDeleted !== true || isLegacyScheduleAnchor(teacher);
}

import type { Student, Supervisor } from '@/lib/types';

/**
 * The responsible-Admin rules, pure so they are provable without React (see
 * scripts/schedule-geometry-tests/studentadmin.test.mjs).
 *
 * THE RELATIONSHIP, in one place:
 *
 *     student.supervisorId → supervisor.id → supervisor.colorHex
 *
 * The Admin is the source of truth for the colour. Nothing here ever reads a
 * colour from a student, a lesson or a name string, which is why reassigning a
 * student recolours them everywhere with a single column write.
 */

/**
 * Which Admins may be assigned to a student.
 *
 * Active ones, matching the schedule filter bar and the colour legend — an
 * Admin who has left should not be a valid new owner. `keepId` always survives
 * the filter so that opening an existing student whose Admin was since
 * deactivated shows that Admin instead of silently blanking the field, which
 * would turn "view this student" into "quietly reassign them on save".
 */
export function selectableAdmins(supervisors: Supervisor[], keepId?: string | null): Supervisor[] {
  return supervisors.filter((s) => s.status === 'active' || s.id === keepId);
}

/**
 * studentId → their Admin's colour, resolved once for a whole screen instead
 * of per row. `null` for a legacy student with no Admin, and for an Admin with
 * no colour assigned — both draw a neutral swatch rather than borrowing
 * someone else's identity.
 */
export function supervisorColorByStudentId(
  students: Student[],
  supervisors: Supervisor[]
): Map<string, string | null> {
  const colorByAdminId = new Map(supervisors.map((s) => [s.id, s.colorHex ?? null]));
  return new Map(
    students.map((s) => [s.id, (s.supervisorId ? colorByAdminId.get(s.supervisorId) : null) ?? null])
  );
}

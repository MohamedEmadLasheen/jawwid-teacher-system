import type { Student } from '@/lib/types';
import type { Database } from '@/lib/database.types';

export type StudentRow = Database['public']['Tables']['students']['Row'];

/** What `createStudent` inserts — the shape, with no Supabase call attached. */
export type StudentInsert = Omit<StudentRow, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>;

export type StudentDraft = Omit<Student, 'id' | 'createdAt' | 'updatedAt' | 'isDeleted'>;

/**
 * The students table ⇄ domain mapping, kept free of the Supabase client so the
 * round trip that carries student ownership is provable in plain Node (see
 * scripts/schedule-geometry-tests/studentadmin.test.mjs).
 *
 * `supervisor_id` ⇄ `supervisorId` is the whole responsible-Admin
 * relationship: a single FK column, read back on every fetch, which is why a
 * reassignment survives a refresh with nothing else to invalidate. No Admin
 * name and no Admin colour is ever written to a student row.
 */
export function toStudent(row: StudentRow): Student {
  return {
    id: row.id,
    branchId: row.branch_id,
    fullName: row.full_name,
    dateOfBirth: row.date_of_birth ?? undefined,
    country: row.country ?? '',
    timezone: row.timezone,
    gender: (row.gender as Student['gender']) ?? undefined,
    level: row.level ?? '',
    status: row.status as Student['status'],
    enrollmentSource: row.enrollment_source ?? '',
    supervisorId: row.supervisor_id,
    isReturning: row.is_returning,
    courseId: row.course_id,
    notes: row.notes ?? '',
    isDeleted: row.is_deleted,
    deletedAt: row.deleted_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function studentInsertPayload(student: StudentDraft): StudentInsert {
  return {
    branch_id: student.branchId ?? null,
    full_name: student.fullName,
    date_of_birth: student.dateOfBirth || null,
    country: student.country,
    timezone: student.timezone,
    gender: student.gender ?? null,
    level: student.level,
    status: student.status,
    enrollment_source: student.enrollmentSource,
    // The responsible Admin. Nullable in the column for legacy rows only; the
    // create form refuses to submit without one (studentValidation.ts), so
    // nothing this application inserts is unowned.
    supervisor_id: student.supervisorId ?? null,
    is_returning: student.isReturning,
    course_id: student.courseId ?? null,
    notes: student.notes,
    is_deleted: false,
  };
}

/**
 * A sparse patch: only the fields the caller actually passed. `undefined`
 * means "not being edited" and is skipped; `null` means "clear it" and is
 * written. Reassigning the Admin is therefore a one-column UPDATE.
 */
export function studentUpdatePatch(updates: Partial<Student>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (updates.fullName !== undefined) patch.full_name = updates.fullName;
  if (updates.dateOfBirth !== undefined) patch.date_of_birth = updates.dateOfBirth || null;
  if (updates.country !== undefined) patch.country = updates.country;
  if (updates.timezone !== undefined) patch.timezone = updates.timezone;
  if (updates.gender !== undefined) patch.gender = updates.gender ?? null;
  if (updates.level !== undefined) patch.level = updates.level;
  if (updates.status !== undefined) patch.status = updates.status;
  if (updates.enrollmentSource !== undefined) patch.enrollment_source = updates.enrollmentSource;
  if (updates.supervisorId !== undefined) patch.supervisor_id = updates.supervisorId ?? null;
  if (updates.isReturning !== undefined) patch.is_returning = updates.isReturning;
  if (updates.courseId !== undefined) patch.course_id = updates.courseId ?? null;
  if (updates.notes !== undefined) patch.notes = updates.notes;
  return patch;
}

import { supabase, fetchAllRows } from '@/lib/supabase';
import type { Student } from '@/lib/types';
import type { Database } from '@/lib/database.types';

type Row = Database['public']['Tables']['students']['Row'];

function toStudent(row: Row): Student {
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

export async function fetchStudents(): Promise<Student[]> {
  const rows = await fetchAllRows<Row>((from, to) =>
    supabase
      .from('students')
      .select('*')
      .order('created_at', { ascending: false })
      .order('id', { ascending: true }) // tiebreaker: many demo rows share the exact same created_at (one transaction), and .range() pagination needs a fully deterministic order or ties get duplicated/dropped across page boundaries
      .range(from, to)
  );
  return rows.map(toStudent);
}

export async function createStudent(
  student: Omit<Student, 'id' | 'createdAt' | 'updatedAt' | 'isDeleted'>
): Promise<Student> {
  const { data, error } = await supabase
    .from('students')
    .insert({
      branch_id: student.branchId ?? null,
      full_name: student.fullName,
      date_of_birth: student.dateOfBirth || null,
      country: student.country,
      timezone: student.timezone,
      gender: student.gender ?? null,
      level: student.level,
      status: student.status,
      enrollment_source: student.enrollmentSource,
      supervisor_id: student.supervisorId ?? null,
      is_returning: student.isReturning,
      course_id: student.courseId ?? null,
      notes: student.notes,
      is_deleted: false,
    })
    .select()
    .single();
  if (error) throw error;
  return toStudent(data);
}

export async function updateStudent(id: string, updates: Partial<Student>): Promise<Student> {
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

  const { data, error } = await supabase
    .from('students')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return toStudent(data);
}

export async function softDeleteStudent(id: string): Promise<void> {
  const { error } = await supabase
    .from('students')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function restoreStudent(id: string): Promise<void> {
  const { error } = await supabase
    .from('students')
    .update({ is_deleted: false, deleted_at: null })
    .eq('id', id);
  if (error) throw error;
}

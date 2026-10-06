import { supabase, fetchAllRows } from '@/lib/supabase';
import type { Student } from '@/lib/types';
import {
  toStudent, studentInsertPayload, studentUpdatePatch, type StudentRow,
} from './students.mapper';

type Row = StudentRow;

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
    .insert(studentInsertPayload(student))
    .select()
    .single();
  if (error) throw error;
  return toStudent(data);
}

export async function updateStudent(id: string, updates: Partial<Student>): Promise<Student> {
  const { data, error } = await supabase
    .from('students')
    .update(studentUpdatePatch(updates))
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

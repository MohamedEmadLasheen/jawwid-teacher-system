import { supabase } from '@/lib/supabase';
import type { Teacher } from '@/lib/types';
import type { Database } from '@/lib/database.types';

type Row = Database['public']['Tables']['teachers']['Row'];

function toTeacher(row: Row): Teacher {
  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    nationality: row.nationality,
    joiningDate: row.joining_date ?? '',
    monthlySalary: row.monthly_salary,
    salaryCurrency: row.salary_currency as Teacher['salaryCurrency'],
    salaryType: row.salary_type as Teacher['salaryType'],
    teachingMarket: row.teaching_market as Teacher['teachingMarket'],
    specializations: row.specializations as Teacher['specializations'],
    status: row.status as Teacher['status'],
    level: row.level as Teacher['level'],
    notes: row.notes,
    isDeleted: row.is_deleted,
    deletedAt: row.deleted_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchTeachers(): Promise<Teacher[]> {
  const { data, error } = await supabase
    .from('teachers')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toTeacher);
}

export async function createTeacher(
  teacher: Omit<Teacher, 'id' | 'createdAt' | 'updatedAt' | 'isDeleted'>
): Promise<Teacher> {
  const { data, error } = await supabase
    .from('teachers')
    .insert({
      full_name: teacher.fullName,
      phone: teacher.phone,
      email: teacher.email,
      nationality: teacher.nationality,
      joining_date: teacher.joiningDate || null,
      monthly_salary: teacher.monthlySalary,
      salary_currency: teacher.salaryCurrency,
      salary_type: teacher.salaryType,
      teaching_market: teacher.teachingMarket,
      specializations: teacher.specializations,
      status: teacher.status,
      level: teacher.level,
      notes: teacher.notes,
      is_deleted: false,
    })
    .select()
    .single();
  if (error) throw error;
  return toTeacher(data);
}

export async function updateTeacher(id: string, updates: Partial<Teacher>): Promise<Teacher> {
  const patch: Record<string, unknown> = {};
  if (updates.fullName !== undefined) patch.full_name = updates.fullName;
  if (updates.phone !== undefined) patch.phone = updates.phone;
  if (updates.email !== undefined) patch.email = updates.email;
  if (updates.nationality !== undefined) patch.nationality = updates.nationality;
  if (updates.joiningDate !== undefined) patch.joining_date = updates.joiningDate || null;
  if (updates.monthlySalary !== undefined) patch.monthly_salary = updates.monthlySalary;
  if (updates.salaryCurrency !== undefined) patch.salary_currency = updates.salaryCurrency;
  if (updates.salaryType !== undefined) patch.salary_type = updates.salaryType;
  if (updates.teachingMarket !== undefined) patch.teaching_market = updates.teachingMarket;
  if (updates.specializations !== undefined) patch.specializations = updates.specializations;
  if (updates.status !== undefined) patch.status = updates.status;
  if (updates.level !== undefined) patch.level = updates.level;
  if (updates.notes !== undefined) patch.notes = updates.notes;

  const { data, error } = await supabase
    .from('teachers')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return toTeacher(data);
}

export async function softDeleteTeacher(id: string): Promise<void> {
  const { error } = await supabase
    .from('teachers')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function restoreTeacher(id: string): Promise<void> {
  const { error } = await supabase
    .from('teachers')
    .update({ is_deleted: false, deleted_at: null })
    .eq('id', id);
  if (error) throw error;
}

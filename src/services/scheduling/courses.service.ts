import { supabase } from '@/lib/supabase';
import type { Course } from '@/lib/types';
import type { Database } from '@/lib/database.types';

type Row = Database['public']['Tables']['courses']['Row'];

function toCourse(row: Row): Course {
  return {
    id: row.id,
    branchId: row.branch_id,
    nameEn: row.name_en,
    nameAr: row.name_ar,
    category: row.category as Course['category'],
    defaultDurationMinutes: row.default_duration_minutes,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchCourses(): Promise<Course[]> {
  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toCourse);
}

export async function createCourse(
  course: Omit<Course, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Course> {
  const { data, error } = await supabase
    .from('courses')
    .insert({
      branch_id: course.branchId ?? null,
      name_en: course.nameEn,
      name_ar: course.nameAr,
      category: course.category,
      default_duration_minutes: course.defaultDurationMinutes,
      is_active: course.isActive,
    })
    .select()
    .single();
  if (error) throw error;
  return toCourse(data);
}

export async function updateCourse(id: string, updates: Partial<Course>): Promise<Course> {
  const patch: Record<string, unknown> = {};
  if (updates.nameEn !== undefined) patch.name_en = updates.nameEn;
  if (updates.nameAr !== undefined) patch.name_ar = updates.nameAr;
  if (updates.category !== undefined) patch.category = updates.category;
  if (updates.defaultDurationMinutes !== undefined) patch.default_duration_minutes = updates.defaultDurationMinutes;
  if (updates.isActive !== undefined) patch.is_active = updates.isActive;

  const { data, error } = await supabase
    .from('courses')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return toCourse(data);
}

export async function deleteCourse(id: string): Promise<void> {
  const { error } = await supabase.from('courses').delete().eq('id', id);
  if (error) throw error;
}

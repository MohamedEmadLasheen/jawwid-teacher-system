import { supabase } from '@/lib/supabase';
import type { TeacherAvailability } from '@/lib/types';
import type { Database } from '@/lib/database.types';

type Row = Database['public']['Tables']['teacher_availability']['Row'];

function toTeacherAvailability(row: Row): TeacherAvailability {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    dayOfWeek: row.day_of_week as TeacherAvailability['dayOfWeek'],
    startMinute: row.start_minute,
    endMinute: row.end_minute,
    timezone: row.timezone,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchTeacherAvailability(teacherId?: string): Promise<TeacherAvailability[]> {
  let query = supabase.from('teacher_availability').select('*').order('day_of_week', { ascending: true });
  if (teacherId) query = query.eq('teacher_id', teacherId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(toTeacherAvailability);
}

export async function createTeacherAvailability(
  block: Omit<TeacherAvailability, 'id' | 'createdAt' | 'updatedAt' | 'isActive'>
): Promise<TeacherAvailability> {
  const { data, error } = await supabase
    .from('teacher_availability')
    .insert({
      teacher_id: block.teacherId,
      day_of_week: block.dayOfWeek,
      start_minute: block.startMinute,
      end_minute: block.endMinute,
      timezone: block.timezone,
      is_active: true,
    })
    .select()
    .single();
  if (error) throw error;
  return toTeacherAvailability(data);
}

export async function deleteTeacherAvailability(id: string): Promise<void> {
  const { error } = await supabase.from('teacher_availability').delete().eq('id', id);
  if (error) throw error;
}

export interface UnifiedAvailabilitySlot {
  teacherId: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  timezone: string;
  source: 'hourly' | 'shift';
}

/** Reads the unified hourly+shift availability view — the only thing the grid/conflict-check/assistant ever read for "is this teacher available". */
export async function fetchUnifiedAvailabilityForDay(dayOfWeek: number): Promise<UnifiedAvailabilitySlot[]> {
  const { data, error } = await supabase
    .from('v_teacher_availability_unified')
    .select('*')
    .eq('day_of_week', dayOfWeek);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    teacherId: row.teacher_id,
    dayOfWeek: row.day_of_week,
    startMinute: row.start_minute,
    endMinute: row.end_minute,
    timezone: row.timezone,
    source: row.source as 'hourly' | 'shift',
  }));
}

import { supabase } from '@/lib/supabase';
import type { ShiftTemplate, TeacherShiftAssignment } from '@/lib/types';
import type { Database } from '@/lib/database.types';

type Row = Database['public']['Tables']['shift_templates']['Row'];
type AssignmentRow = Database['public']['Tables']['teacher_shift_assignments']['Row'];

function toShiftTemplate(row: Row): ShiftTemplate {
  return {
    id: row.id,
    branchId: row.branch_id,
    name: row.name,
    startMinute: row.start_minute,
    endMinute: row.end_minute,
    timezone: row.timezone,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toTeacherShiftAssignment(row: AssignmentRow): TeacherShiftAssignment {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    shiftTemplateId: row.shift_template_id,
    dayOfWeek: row.day_of_week as TeacherShiftAssignment['dayOfWeek'],
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchShiftTemplates(): Promise<ShiftTemplate[]> {
  const { data, error } = await supabase
    .from('shift_templates')
    .select('*')
    .order('start_minute', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toShiftTemplate);
}

export async function createShiftTemplate(
  template: Omit<ShiftTemplate, 'id' | 'createdAt' | 'updatedAt'>
): Promise<ShiftTemplate> {
  const { data, error } = await supabase
    .from('shift_templates')
    .insert({
      branch_id: template.branchId ?? null,
      name: template.name,
      start_minute: template.startMinute,
      end_minute: template.endMinute,
      timezone: template.timezone,
      is_active: template.isActive,
    })
    .select()
    .single();
  if (error) throw error;
  return toShiftTemplate(data);
}

export async function updateShiftTemplate(id: string, updates: Partial<ShiftTemplate>): Promise<ShiftTemplate> {
  const patch: Record<string, unknown> = {};
  if (updates.name !== undefined) patch.name = updates.name;
  if (updates.startMinute !== undefined) patch.start_minute = updates.startMinute;
  if (updates.endMinute !== undefined) patch.end_minute = updates.endMinute;
  if (updates.timezone !== undefined) patch.timezone = updates.timezone;
  if (updates.isActive !== undefined) patch.is_active = updates.isActive;

  const { data, error } = await supabase
    .from('shift_templates')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return toShiftTemplate(data);
}

export async function deleteShiftTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('shift_templates').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchTeacherShiftAssignments(teacherId?: string): Promise<TeacherShiftAssignment[]> {
  let query = supabase.from('teacher_shift_assignments').select('*');
  if (teacherId) query = query.eq('teacher_id', teacherId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(toTeacherShiftAssignment);
}

export async function assignTeacherShift(
  assignment: Omit<TeacherShiftAssignment, 'id' | 'createdAt' | 'updatedAt' | 'isActive'>
): Promise<TeacherShiftAssignment> {
  const { data, error } = await supabase
    .from('teacher_shift_assignments')
    .insert({
      teacher_id: assignment.teacherId,
      shift_template_id: assignment.shiftTemplateId,
      day_of_week: assignment.dayOfWeek,
      is_active: true,
    })
    .select()
    .single();
  if (error) throw error;
  return toTeacherShiftAssignment(data);
}

export async function unassignTeacherShift(id: string): Promise<void> {
  const { error } = await supabase.from('teacher_shift_assignments').delete().eq('id', id);
  if (error) throw error;
}

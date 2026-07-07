import { supabase } from '@/lib/supabase';
import type { Parent, StudentParent } from '@/lib/types';
import type { Database } from '@/lib/database.types';

type Row = Database['public']['Tables']['parents']['Row'];
type LinkRow = Database['public']['Tables']['student_parents']['Row'];

function toParent(row: Row): Parent {
  return {
    id: row.id,
    branchId: row.branch_id,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email ?? '',
    country: row.country ?? '',
    timezone: row.timezone,
    preferredLanguage: row.preferred_language as Parent['preferredLanguage'],
    notes: row.notes ?? '',
    isDeleted: row.is_deleted,
    deletedAt: row.deleted_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toStudentParent(row: LinkRow): StudentParent {
  return {
    id: row.id,
    studentId: row.student_id,
    parentId: row.parent_id,
    relationship: row.relationship as StudentParent['relationship'],
    isPrimaryContact: row.is_primary_contact,
    createdAt: row.created_at,
  };
}

export async function fetchParents(): Promise<Parent[]> {
  const { data, error } = await supabase
    .from('parents')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toParent);
}

export async function createParent(
  parent: Omit<Parent, 'id' | 'createdAt' | 'updatedAt' | 'isDeleted'>
): Promise<Parent> {
  const { data, error } = await supabase
    .from('parents')
    .insert({
      branch_id: parent.branchId ?? null,
      full_name: parent.fullName,
      phone: parent.phone,
      email: parent.email,
      country: parent.country,
      timezone: parent.timezone,
      preferred_language: parent.preferredLanguage,
      notes: parent.notes,
      is_deleted: false,
    })
    .select()
    .single();
  if (error) throw error;
  return toParent(data);
}

export async function updateParent(id: string, updates: Partial<Parent>): Promise<Parent> {
  const patch: Record<string, unknown> = {};
  if (updates.fullName !== undefined) patch.full_name = updates.fullName;
  if (updates.phone !== undefined) patch.phone = updates.phone;
  if (updates.email !== undefined) patch.email = updates.email;
  if (updates.country !== undefined) patch.country = updates.country;
  if (updates.timezone !== undefined) patch.timezone = updates.timezone;
  if (updates.preferredLanguage !== undefined) patch.preferred_language = updates.preferredLanguage;
  if (updates.notes !== undefined) patch.notes = updates.notes;

  const { data, error } = await supabase
    .from('parents')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return toParent(data);
}

export async function softDeleteParent(id: string): Promise<void> {
  const { error } = await supabase
    .from('parents')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function restoreParent(id: string): Promise<void> {
  const { error } = await supabase
    .from('parents')
    .update({ is_deleted: false, deleted_at: null })
    .eq('id', id);
  if (error) throw error;
}

// ─── Student ↔ Parent links ───────────────────────────────────────────────────

export async function fetchStudentParents(): Promise<StudentParent[]> {
  const { data, error } = await supabase.from('student_parents').select('*');
  if (error) throw error;
  return (data ?? []).map(toStudentParent);
}

export async function linkStudentParent(link: {
  studentId: string;
  parentId: string;
  relationship: StudentParent['relationship'];
  isPrimaryContact: boolean;
}): Promise<StudentParent> {
  const { data, error } = await supabase
    .from('student_parents')
    .insert({
      student_id: link.studentId,
      parent_id: link.parentId,
      relationship: link.relationship,
      is_primary_contact: link.isPrimaryContact,
    })
    .select()
    .single();
  if (error) throw error;
  return toStudentParent(data);
}

export async function unlinkStudentParent(id: string): Promise<void> {
  const { error } = await supabase.from('student_parents').delete().eq('id', id);
  if (error) throw error;
}

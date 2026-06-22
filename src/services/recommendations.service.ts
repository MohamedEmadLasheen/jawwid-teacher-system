import { supabase } from '@/lib/supabase';
import type { AdminRecommendation, AdminNote, RecommendationStatus } from '@/lib/types';
import type { Database } from '@/lib/database.types';

type RecRow = Database['public']['Tables']['admin_recommendations']['Row'];
type NoteRow = Database['public']['Tables']['admin_notes']['Row'];

function toRec(row: RecRow): AdminRecommendation {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    createdBy: row.created_by,
    category: row.category as AdminRecommendation['category'],
    content: row.content,
    status: row.status as RecommendationStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toNote(row: NoteRow): AdminNote {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    createdBy: row.created_by,
    content: row.content,
    createdAt: row.created_at,
  };
}

export async function fetchRecommendations(): Promise<AdminRecommendation[]> {
  const { data, error } = await supabase
    .from('admin_recommendations')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toRec);
}

export async function createRecommendation(
  rec: Omit<AdminRecommendation, 'id' | 'createdAt' | 'updatedAt'>
): Promise<AdminRecommendation> {
  const { data, error } = await supabase
    .from('admin_recommendations')
    .insert({
      teacher_id: rec.teacherId,
      created_by: rec.createdBy,
      category: rec.category,
      content: rec.content,
      status: rec.status,
    })
    .select()
    .single();
  if (error) throw error;
  return toRec(data);
}

export async function updateRecommendationStatus(
  id: string,
  status: RecommendationStatus
): Promise<void> {
  const { error } = await supabase
    .from('admin_recommendations')
    .update({ status })
    .eq('id', id);
  if (error) throw error;
}

export async function fetchAdminNotes(): Promise<AdminNote[]> {
  const { data, error } = await supabase
    .from('admin_notes')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toNote);
}

export async function createAdminNote(
  note: Omit<AdminNote, 'id' | 'createdAt'>
): Promise<AdminNote> {
  const { data, error } = await supabase
    .from('admin_notes')
    .insert({
      teacher_id: note.teacherId,
      created_by: note.createdBy,
      content: note.content,
    })
    .select()
    .single();
  if (error) throw error;
  return toNote(data);
}

export async function deleteRecommendation(id: string): Promise<void> {
  const { error } = await supabase.from('admin_recommendations').delete().eq('id', id);
  if (error) throw error;
}

export async function deleteAdminNote(id: string): Promise<void> {
  const { error } = await supabase.from('admin_notes').delete().eq('id', id);
  if (error) throw error;
}

import { supabase } from '@/lib/supabase';
import type { Bonus } from '@/lib/types';
import type { Database } from '@/lib/database.types';

type Row = Database['public']['Tables']['bonuses']['Row'];

function toBonus(row: Row): Bonus {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    date: row.date,
    category: row.category as Bonus['category'],
    currency: row.currency as Bonus['currency'],
    amount: row.amount,
    percentage: row.percentage,
    reason: row.reason,
    supervisorName: row.supervisor_name,
    notes: row.notes,
    approvalStatus: row.approval_status as Bonus['approvalStatus'],
    createdAt: row.created_at,
  };
}

export async function fetchBonuses(): Promise<Bonus[]> {
  const { data, error } = await supabase
    .from('bonuses')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toBonus);
}

export async function createBonus(b: Omit<Bonus, 'id' | 'createdAt'>): Promise<Bonus> {
  const { data, error } = await supabase
    .from('bonuses')
    .insert({
      teacher_id: b.teacherId,
      date: b.date,
      category: b.category,
      currency: b.currency,
      amount: b.amount,
      percentage: b.percentage,
      reason: b.reason,
      supervisor_name: b.supervisorName,
      notes: b.notes,
      approval_status: b.approvalStatus,
    })
    .select()
    .single();
  if (error) throw error;
  return toBonus(data);
}

export async function updateBonusApproval(
  id: string,
  status: 'approved' | 'rejected'
): Promise<void> {
  const { error } = await supabase
    .from('bonuses')
    .update({ approval_status: status })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteBonus(id: string): Promise<void> {
  const { error } = await supabase.from('bonuses').delete().eq('id', id);
  if (error) throw error;
}

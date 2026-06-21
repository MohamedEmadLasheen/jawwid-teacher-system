import { supabase } from '@/lib/supabase';
import type { Deduction } from '@/lib/types';
import type { Database } from '@/lib/database.types';

type Row = Database['public']['Tables']['deductions']['Row'];

function toDeduction(row: Row): Deduction {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    date: row.date,
    category: row.category as Deduction['category'],
    currency: row.currency as Deduction['currency'],
    amount: row.amount,
    percentage: row.percentage,
    reason: row.reason,
    supervisorName: row.supervisor_name,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export async function fetchDeductions(): Promise<Deduction[]> {
  const { data, error } = await supabase
    .from('deductions')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toDeduction);
}

export async function createDeduction(d: Omit<Deduction, 'id' | 'createdAt'>): Promise<Deduction> {
  const { data, error } = await supabase
    .from('deductions')
    .insert({
      teacher_id: d.teacherId,
      date: d.date,
      category: d.category,
      currency: d.currency,
      amount: d.amount,
      percentage: d.percentage,
      reason: d.reason,
      supervisor_name: d.supervisorName,
      notes: d.notes,
    })
    .select()
    .single();
  if (error) throw error;
  return toDeduction(data);
}

export async function deleteDeduction(id: string): Promise<void> {
  const { error } = await supabase.from('deductions').delete().eq('id', id);
  if (error) throw error;
}

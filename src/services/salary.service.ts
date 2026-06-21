import { supabase } from '@/lib/supabase';
import type { SalaryRecord } from '@/lib/types';
import type { Database } from '@/lib/database.types';

type Row = Database['public']['Tables']['salary_records']['Row'];

function toRecord(row: Row): SalaryRecord {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    month: row.month,
    baseSalary: row.base_salary,
    currency: row.currency as SalaryRecord['currency'],
    bonus: row.bonus,
    deduction: row.deduction,
    commission: row.commission,
    net: row.net,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export async function fetchSalaryRecords(): Promise<SalaryRecord[]> {
  const { data, error } = await supabase
    .from('salary_records')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toRecord);
}

export async function createSalaryRecord(
  record: Omit<SalaryRecord, 'id' | 'createdAt'>
): Promise<SalaryRecord> {
  const { data, error } = await supabase
    .from('salary_records')
    .insert({
      teacher_id: record.teacherId,
      month: record.month,
      base_salary: record.baseSalary,
      currency: record.currency,
      bonus: record.bonus,
      deduction: record.deduction,
      commission: record.commission,
      net: record.net,
      notes: record.notes,
    })
    .select()
    .single();
  if (error) throw error;
  return toRecord(data);
}

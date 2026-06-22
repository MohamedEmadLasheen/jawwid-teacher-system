import { supabase } from '@/lib/supabase';
import type { ImprovementPlan } from '@/lib/types';
import type { Database } from '@/lib/database.types';

type Row = Database['public']['Tables']['improvement_plans']['Row'];

function toPlan(row: Row): ImprovementPlan {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    createdBy: row.created_by,
    issue: row.issue,
    goal: row.goal,
    actionSteps: row.action_steps,
    targetDate: row.target_date ?? '',
    followUpDate: row.follow_up_date ?? '',
    followUpPercentage: row.follow_up_percentage,
    status: row.status as ImprovementPlan['status'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchPlans(): Promise<ImprovementPlan[]> {
  const { data, error } = await supabase
    .from('improvement_plans')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toPlan);
}

export async function createPlan(
  plan: Omit<ImprovementPlan, 'id' | 'createdAt' | 'updatedAt'>
): Promise<ImprovementPlan> {
  const { data, error } = await supabase
    .from('improvement_plans')
    .insert({
      teacher_id: plan.teacherId,
      created_by: plan.createdBy,
      issue: plan.issue,
      goal: plan.goal,
      action_steps: plan.actionSteps,
      target_date: plan.targetDate || null,
      follow_up_date: plan.followUpDate || null,
      follow_up_percentage: plan.followUpPercentage,
      status: plan.status,
    })
    .select()
    .single();
  if (error) throw error;
  return toPlan(data);
}

export async function updatePlan(
  id: string,
  updates: Partial<ImprovementPlan>
): Promise<ImprovementPlan> {
  const patch: Record<string, unknown> = {};
  if (updates.issue !== undefined) patch.issue = updates.issue;
  if (updates.goal !== undefined) patch.goal = updates.goal;
  if (updates.actionSteps !== undefined) patch.action_steps = updates.actionSteps;
  if (updates.targetDate !== undefined) patch.target_date = updates.targetDate || null;
  if (updates.followUpDate !== undefined) patch.follow_up_date = updates.followUpDate || null;
  if (updates.followUpPercentage !== undefined) patch.follow_up_percentage = updates.followUpPercentage;
  if (updates.status !== undefined) patch.status = updates.status;

  const { data, error } = await supabase
    .from('improvement_plans')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return toPlan(data);
}

export async function deletePlan(id: string): Promise<void> {
  const { error } = await supabase.from('improvement_plans').delete().eq('id', id);
  if (error) throw error;
}

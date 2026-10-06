import { supabase } from '@/lib/supabase';
import type { Supervisor, Permission } from '@/lib/types';
import type { Database } from '@/lib/database.types';

type Row = Database['public']['Tables']['supervisors']['Row'];

function toSupervisor(row: Row): Supervisor {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    department: row.department,
    status: row.status as Supervisor['status'],
    permissions: row.permissions as Permission[],
    userId: row.user_id,
    colorHex: row.color_hex,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchSupervisors(): Promise<Supervisor[]> {
  const { data, error } = await supabase
    .from('supervisors')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toSupervisor);
}

export async function createSupervisor(
  s: Omit<Supervisor, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Supervisor> {
  const { data, error } = await supabase
    .from('supervisors')
    .insert({
      name: s.name,
      email: s.email,
      phone: s.phone,
      department: s.department,
      status: s.status,
      permissions: s.permissions as string[],
      user_id: s.userId ?? null,
      // The Admin's canonical colour. It is the SOURCE OF TRUTH for every
      // student this supervisor owns (students resolve supervisorId ->
      // colorHex and store no colour of their own), so the picker's value has
      // to reach the database — without this the schedule legend could never
      // show a newly created Admin.
      color_hex: s.colorHex ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return toSupervisor(data);
}

export async function updateSupervisor(
  id: string,
  updates: Partial<Supervisor>
): Promise<Supervisor> {
  const patch: Record<string, unknown> = {};
  if (updates.name !== undefined) patch.name = updates.name;
  if (updates.email !== undefined) patch.email = updates.email;
  if (updates.phone !== undefined) patch.phone = updates.phone;
  if (updates.department !== undefined) patch.department = updates.department;
  if (updates.status !== undefined) patch.status = updates.status;
  if (updates.permissions !== undefined) patch.permissions = updates.permissions;
  // Same reason as createSupervisor: recolouring an Admin must recolour their
  // students, which only works if the colour is actually persisted here.
  if (updates.colorHex !== undefined) patch.color_hex = updates.colorHex ?? null;

  const { data, error } = await supabase
    .from('supervisors')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return toSupervisor(data);
}

export async function deleteSupervisor(id: string): Promise<void> {
  const { error } = await supabase.from('supervisors').delete().eq('id', id);
  if (error) throw error;
}

import { supabase } from '@/lib/supabase';
import type { Complaint, ComplaintAction, ComplaintStatus } from '@/lib/types';
import type { Database } from '@/lib/database.types';

type ComplaintRow = Database['public']['Tables']['complaints']['Row'];
type ActionRow = Database['public']['Tables']['complaint_actions']['Row'];

type ComplaintWithActions = ComplaintRow & { complaint_actions: ActionRow[] };

function toAction(row: ActionRow): ComplaintAction {
  return {
    id: row.id,
    status: row.status as ComplaintStatus,
    note: row.note,
    byUser: row.by_user,
    timestamp: row.timestamp,
  };
}

function toComplaint(row: ComplaintWithActions): Complaint {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    reportedBy: row.reported_by,
    description: row.description,
    status: row.status as ComplaintStatus,
    priority: row.priority as Complaint['priority'],
    assignedSupervisor: row.assigned_supervisor ?? undefined,
    resolutionNotes: row.resolution_notes ?? undefined,
    resolutionDate: row.resolution_date ?? undefined,
    actions: (row.complaint_actions ?? []).map(toAction),
    createdAt: row.created_at,
    resolvedAt: row.resolved_at ?? undefined,
    closedAt: row.closed_at ?? undefined,
  };
}

export async function fetchComplaints(): Promise<Complaint[]> {
  const { data, error } = await supabase
    .from('complaints')
    .select('*, complaint_actions(*)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => toComplaint(row as ComplaintWithActions));
}

export async function createComplaint(
  c: Omit<Complaint, 'id' | 'createdAt' | 'actions'>
): Promise<Complaint> {
  const { data: complaint, error } = await supabase
    .from('complaints')
    .insert({
      teacher_id: c.teacherId,
      reported_by: c.reportedBy,
      description: c.description,
      status: c.status,
      priority: c.priority,
      assigned_supervisor: c.assignedSupervisor ?? null,
    })
    .select()
    .single();
  if (error) throw error;

  const { data: action, error: actionError } = await supabase
    .from('complaint_actions')
    .insert({
      complaint_id: complaint.id,
      status: 'open',
      note: 'تم تسجيل الشكوى',
      by_user: c.reportedBy,
    })
    .select()
    .single();
  if (actionError) throw actionError;

  return toComplaint({ ...complaint, complaint_actions: [action] });
}

export async function advanceComplaintStatus(
  id: string,
  newStatus: ComplaintStatus,
  note: string,
  byUser: string
): Promise<{ complaint: Partial<Complaint>; action: ComplaintAction }> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: newStatus };
  if (newStatus === 'resolved') patch.resolved_at = now;
  if (newStatus === 'closed') patch.closed_at = now;

  const [{ error: cErr }, actionRes] = await Promise.all([
    supabase.from('complaints').update(patch).eq('id', id),
    supabase.from('complaint_actions').insert({
      complaint_id: id,
      status: newStatus,
      note,
      by_user: byUser,
    }).select().single(),
  ]);
  if (cErr) throw cErr;
  if (actionRes.error) throw actionRes.error;

  return {
    complaint: {
      status: newStatus,
      resolvedAt: newStatus === 'resolved' ? now : undefined,
      closedAt: newStatus === 'closed' ? now : undefined,
    },
    action: toAction(actionRes.data),
  };
}

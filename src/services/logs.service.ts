import { supabase } from '@/lib/supabase';
import type { ActivityLog, UserRole } from '@/lib/types';
import type { Database } from '@/lib/database.types';

type Row = Database['public']['Tables']['activity_logs']['Row'];

export interface EnhancedLog extends ActivityLog {
  tableName?: string;
  recordId?: string;
  ip: string;
  browser: string;
  device: string;
}

function toLog(row: Row): EnhancedLog {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    userRole: row.user_role as UserRole,
    action: row.action,
    target: row.target,
    details: row.details,
    beforeValue: row.before_value ?? undefined,
    afterValue: row.after_value ?? undefined,
    timestamp: row.timestamp,
    tableName: row.table_name ?? undefined,
    recordId: row.record_id ?? undefined,
    ip: row.ip,
    browser: row.browser,
    device: row.device,
  };
}

function getBrowserInfo() {
  const ua = navigator.userAgent;
  let browser = 'Unknown';
  if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Edg')) browser = 'Edge';

  let device = 'Desktop';
  if (/Mobi|Android|iPhone|iPad/.test(ua)) device = /iPad/.test(ua) ? 'Tablet' : 'Mobile';

  return { ip: '—', browser, device };
}

export async function fetchLogs(): Promise<EnhancedLog[]> {
  const { data, error } = await supabase
    .from('activity_logs')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(2000);
  if (error) throw error;
  return (data ?? []).map(toLog);
}

export async function addLog(
  log: Omit<ActivityLog, 'id' | 'timestamp'> & { tableName?: string; recordId?: string }
): Promise<EnhancedLog> {
  const { ip, browser, device } = getBrowserInfo();
  const { data, error } = await supabase
    .from('activity_logs')
    .insert({
      user_id: log.userId,
      user_name: log.userName,
      user_role: log.userRole,
      action: log.action,
      target: log.target,
      details: log.details,
      before_value: log.beforeValue ?? null,
      after_value: log.afterValue ?? null,
      table_name: log.tableName ?? null,
      record_id: log.recordId ?? null,
      ip,
      browser,
      device,
    })
    .select()
    .single();
  if (error) throw error;
  return toLog(data);
}

export async function deleteLog(id: string): Promise<void> {
  const { error } = await supabase.from('activity_logs').delete().eq('id', id);
  if (error) throw error;
}

export async function clearLogs(): Promise<void> {
  const { error } = await supabase.from('activity_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (error) throw error;
}

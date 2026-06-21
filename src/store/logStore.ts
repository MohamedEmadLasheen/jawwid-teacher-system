import { create } from 'zustand';
import type { ActivityLog, UserRole } from '../lib/types';
import * as logSvc from '../services/logs.service';
import type { EnhancedLog } from '../services/logs.service';

export type { EnhancedLog as EnhancedActivityLog };

interface LogState {
  logs: EnhancedLog[];
  loading: boolean;
  error: string | null;

  fetchLogs: () => Promise<void>;
  addLog: (log: Omit<ActivityLog, 'id' | 'timestamp'> & { tableName?: string; recordId?: string }) => Promise<void>;
  clearLogs: () => Promise<void>;
  deleteLog: (id: string) => Promise<void>;
}

export const useLogStore = create<LogState>()((set) => ({
  logs: [],
  loading: false,
  error: null,

  fetchLogs: async () => {
    set({ loading: true, error: null });
    try {
      const logs = await logSvc.fetchLogs();
      set({ logs, loading: false });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to load logs', loading: false });
    }
  },

  addLog: async (log) => {
    try {
      const newLog = await logSvc.addLog(log);
      set((state) => ({ logs: [newLog, ...state.logs].slice(0, 2000) }));
    } catch {
      // Logging failures should be silent — never break the user action
    }
  },

  clearLogs: async () => {
    await logSvc.clearLogs();
    set({ logs: [] });
  },

  deleteLog: async (id) => {
    await logSvc.deleteLog(id);
    set((state) => ({ logs: state.logs.filter((l) => l.id !== id) }));
  },
}));

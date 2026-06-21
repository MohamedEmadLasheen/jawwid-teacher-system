import { create } from 'zustand';
import type { Supervisor, Permission } from '../lib/types';
import * as supervisorSvc from '../services/supervisors.service';

interface SupervisorState {
  supervisors: Supervisor[];
  loading: boolean;
  error: string | null;

  fetchSupervisors: () => Promise<void>;
  addSupervisor: (supervisor: Omit<Supervisor, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateSupervisor: (id: string, updates: Partial<Supervisor>) => Promise<void>;
  deleteSupervisor: (id: string) => Promise<void>;
  disableSupervisor: (id: string) => Promise<void>;
  updateSupervisorPermissions: (id: string, permissions: Permission[]) => Promise<void>;
}

export const useSupervisorStore = create<SupervisorState>()((set) => ({
  supervisors: [],
  loading: false,
  error: null,

  fetchSupervisors: async () => {
    set({ loading: true, error: null });
    try {
      const supervisors = await supervisorSvc.fetchSupervisors();
      set({ supervisors, loading: false });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to load supervisors', loading: false });
    }
  },

  addSupervisor: async (supervisor) => {
    const newSupervisor = await supervisorSvc.createSupervisor(supervisor);
    set((state) => ({ supervisors: [...state.supervisors, newSupervisor] }));
  },

  updateSupervisor: async (id, updates) => {
    const updated = await supervisorSvc.updateSupervisor(id, updates);
    set((state) => ({
      supervisors: state.supervisors.map((s) => (s.id === id ? updated : s)),
    }));
  },

  deleteSupervisor: async (id) => {
    await supervisorSvc.deleteSupervisor(id);
    set((state) => ({
      supervisors: state.supervisors.filter((s) => s.id !== id),
    }));
  },

  disableSupervisor: async (id) => {
    await supervisorSvc.updateSupervisor(id, { status: 'inactive' });
    set((state) => ({
      supervisors: state.supervisors.map((s) =>
        s.id === id ? { ...s, status: 'inactive', updatedAt: new Date().toISOString() } : s
      ),
    }));
  },

  updateSupervisorPermissions: async (id, permissions) => {
    await supervisorSvc.updateSupervisor(id, { permissions });
    set((state) => ({
      supervisors: state.supervisors.map((s) =>
        s.id === id ? { ...s, permissions, updatedAt: new Date().toISOString() } : s
      ),
    }));
  },
}));

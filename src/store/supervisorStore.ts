import { create } from 'zustand';
import type { Supervisor, Permission } from '../lib/types';
import * as supervisorSvc from '../services/supervisors.service';
import { createUser, updateProfile, disableUser } from '../services/auth.service';

interface SupervisorState {
  supervisors: Supervisor[];
  loading: boolean;
  error: string | null;

  fetchSupervisors: () => Promise<void>;
  /** If `password` is provided, also creates a login account (role 'supervisor'). */
  addSupervisor: (supervisor: Omit<Supervisor, 'id' | 'createdAt' | 'updatedAt'>, password?: string) => Promise<void>;
  updateSupervisor: (id: string, updates: Partial<Supervisor>) => Promise<void>;
  deleteSupervisor: (id: string) => Promise<void>;
  disableSupervisor: (id: string) => Promise<void>;
  updateSupervisorPermissions: (id: string, permissions: Permission[]) => Promise<void>;
}

export const useSupervisorStore = create<SupervisorState>()((set, get) => ({
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

  addSupervisor: async (supervisor, password) => {
    let userId: string | null = null;
    // When a password is supplied, create a real login account (role
    // 'supervisor') so the permissions below are actually enforced.
    if (password) {
      const profile = await createUser(
        supervisor.name,
        supervisor.email,
        password,
        'supervisor',
        supervisor.permissions,
        { phone: supervisor.phone, department: supervisor.department }
      );
      userId = profile.id;
    }
    const newSupervisor = await supervisorSvc.createSupervisor({ ...supervisor, userId });
    set((state) => ({ supervisors: [...state.supervisors, newSupervisor] }));
  },

  updateSupervisor: async (id, updates) => {
    const existing = get().supervisors.find((s) => s.id === id);
    const updated = await supervisorSvc.updateSupervisor(id, updates);
    // Keep the linked login account in sync (name + active status).
    if (existing?.userId) {
      const patch: Record<string, unknown> = {};
      if (updates.name !== undefined) patch.name = updates.name;
      if (updates.status !== undefined) patch.isActive = updates.status === 'active';
      if (Object.keys(patch).length) await updateProfile(existing.userId, patch);
    }
    set((state) => ({
      supervisors: state.supervisors.map((s) => (s.id === id ? updated : s)),
    }));
  },

  deleteSupervisor: async (id) => {
    const existing = get().supervisors.find((s) => s.id === id);
    // Can't hard-delete an auth user without a service role; disable the
    // login instead so it can no longer sign in, then drop the record.
    if (existing?.userId) await disableUser(existing.userId);
    await supervisorSvc.deleteSupervisor(id);
    set((state) => ({
      supervisors: state.supervisors.filter((s) => s.id !== id),
    }));
  },

  disableSupervisor: async (id) => {
    const existing = get().supervisors.find((s) => s.id === id);
    await supervisorSvc.updateSupervisor(id, { status: 'inactive' });
    if (existing?.userId) await disableUser(existing.userId);
    set((state) => ({
      supervisors: state.supervisors.map((s) =>
        s.id === id ? { ...s, status: 'inactive', updatedAt: new Date().toISOString() } : s
      ),
    }));
  },

  updateSupervisorPermissions: async (id, permissions) => {
    const existing = get().supervisors.find((s) => s.id === id);
    await supervisorSvc.updateSupervisor(id, { permissions });
    // Propagate to the login account so route/nav enforcement reflects it.
    if (existing?.userId) await updateProfile(existing.userId, { permissions });
    set((state) => ({
      supervisors: state.supervisors.map((s) =>
        s.id === id ? { ...s, permissions, updatedAt: new Date().toISOString() } : s
      ),
    }));
  },
}));
